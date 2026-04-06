"""Budgets module — business logic.

Business rules enforced here:
- One budget per (user, category, year, month) — UPSERT semantics, no 409 on duplicate.
- Budget progress is computed from transactions — never stored.
- Free tier: max 5 active budgets per month. Updating an existing budget does NOT
  count against the limit (only new budget creation does).
- A budget can only be set for an expense category, never income.
- year/month default to current month if not provided.
- Budget current endpoint is cached in Redis for 5 minutes.
- Cache is invalidated on any budget write AND on any transaction write (handled
  in transactions/service.py via _invalidate_budget_cache — see note below).
- All DB aggregation (spent amount) is in SQL — never summed in Python.
- All queries filtered by user_id from JWT — never trust client-provided user_id.
"""

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import redis.asyncio as aioredis
from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.budgets.models import Budget
from app.modules.budgets.schemas import BudgetUpsertRequest
from app.modules.categories.models import Category
from app.modules.transactions.models import Transaction

FREE_TIER_BUDGET_LIMIT = 5
BUDGET_CACHE_TTL = 300  # 5 minutes
BUDGET_CACHE_PREFIX = "budgets:current:"


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------


def _budget_cache_key(user_id: uuid.UUID, year: int, month: int) -> str:
    return f"{BUDGET_CACHE_PREFIX}{user_id}:{year}:{month}"


async def invalidate_budget_cache(
    user_id: uuid.UUID,
    year: int,
    month: int,
    redis: aioredis.Redis,
) -> None:
    """Delete the cached budget list for a given user + period.

    Called from this module on budget writes, and also exported so that
    transactions/service.py can invalidate budgets when transactions change.
    """
    await redis.delete(_budget_cache_key(user_id, year, month))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _current_year_month() -> tuple[int, int]:
    now = datetime.now(UTC)
    return now.year, now.month


async def _assert_expense_category(
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Raise 404 if category doesn't exist / isn't accessible.
    Raise 422 if category is an income category (budgets are expense-only).
    """
    result = await db.execute(
        select(Category.category_type).where(
            Category.id == category_id,
            or_(
                Category.is_system.is_(True),
                Category.user_id == user_id,
            ),
        )
    )
    row = result.one_or_none()
    if row is None:
        raise AppException(
            status_code=404,
            error_code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    if row.category_type != "expense":
        raise AppException(
            status_code=422,
            error_code="INCOME_CATEGORY_BUDGET",
            message="Budgets can only be set for expense categories.",
            field="category_id",
        )


async def _compute_budget_progress(
    user_id: uuid.UUID,
    year: int,
    month: int,
    db: AsyncSession,
    budget_ids: list[uuid.UUID] | None = None,
) -> dict[uuid.UUID, Decimal]:
    """Compute total spent amount per budget in a single SQL aggregation.

    Joins budgets → transactions on (category_id, user_id, year, month).
    Returns a dict mapping budget_id → spent_amount.
    """
    stmt = (
        select(
            Budget.id,
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.transaction_type == "expense", Transaction.amount),
                        else_=Decimal("0"),
                    )
                ),
                Decimal("0"),
            ).label("spent"),
        )
        .outerjoin(
            Transaction,
            (Transaction.category_id == Budget.category_id)
            & (Transaction.user_id == user_id)
            & (Transaction.is_deleted.is_(False))
            & (func.extract("year", Transaction.transaction_date) == year)
            & (func.extract("month", Transaction.transaction_date) == month),
        )
        .where(
            Budget.user_id == user_id,
            Budget.budget_year == year,
            Budget.budget_month == month,
        )
        .group_by(Budget.id)
    )

    if budget_ids is not None:
        stmt = stmt.where(Budget.id.in_(budget_ids))

    rows = (await db.execute(stmt)).all()
    return {row.id: Decimal(str(row.spent)) for row in rows}


def _build_budget_response(
    budget: Budget,
    spent: Decimal,
) -> dict:
    """Build the response dict for a single budget with computed progress fields.

    All values are plain Python primitives so the dict is safely JSON-serialisable
    for Redis caching without hitting the str() fallback on ORM objects.
    """
    budgeted = Decimal(str(budget.amount))
    remaining = budgeted - spent

    # Percentage: guard against division by zero when budgeted_amount = 0
    if budgeted > Decimal("0"):
        pct = (spent / budgeted * 100).quantize(Decimal("0.01"))
    else:
        pct = Decimal("0")

    # Serialise category as a plain dict — never put ORM objects in cache payloads
    category = budget.category
    category_dict = {
        "id": str(category.id),
        "name": category.name,
        "icon": category.icon,
        "color": category.color,
    }

    return {
        "id": str(budget.id),
        "category": category_dict,
        "budgeted_amount": str(budgeted),
        "spent_amount": str(spent),
        "remaining_amount": str(remaining),
        "percentage_used": str(pct),
        "alert_at_percent": budget.alert_at_percent,
        "is_over_budget": spent > budgeted,
        "period": {"year": budget.budget_year, "month": budget.budget_month},
        "created_at": budget.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def list_budgets(
    user_id: uuid.UUID,
    db: AsyncSession,
    year: int | None = None,
    month: int | None = None,
) -> list[dict]:
    """Return all budgets for the given period with computed progress.

    Defaults to the current month if year/month not provided.
    Uses a single SQL aggregation — no Python loops over transactions.
    """
    if year is None or month is None:
        year, month = _current_year_month()

    result = await db.execute(
        select(Budget)
        .where(
            Budget.user_id == user_id,
            Budget.budget_year == year,
            Budget.budget_month == month,
        )
        .order_by(Budget.created_at)
    )
    budgets = result.scalars().all()

    if not budgets:
        return []

    # Load categories (avoid N+1)
    category_ids = [b.category_id for b in budgets]
    cat_result = await db.execute(select(Category).where(Category.id.in_(category_ids)))
    categories = {c.id: c for c in cat_result.scalars().all()}
    for b in budgets:
        b.category = categories[b.category_id]

    spent_map = await _compute_budget_progress(user_id, year, month, db)
    return [_build_budget_response(b, spent_map.get(b.id, Decimal("0"))) for b in budgets]


async def upsert_budget(
    user_id: uuid.UUID,
    payload: BudgetUpsertRequest,
    is_premium: bool,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict:
    """Create or update a budget (UPSERT semantics).

    Free tier limit (5 budgets/month) is only enforced on INSERT, not UPDATE.
    Uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE to guarantee atomicity.
    """
    if payload.year is None or payload.month is None:
        year, month = _current_year_month()
    else:
        year, month = payload.year, payload.month

    await _assert_expense_category(payload.category_id, user_id, db)

    # Check if this budget already exists (to distinguish insert vs update for limit)
    existing_result = await db.execute(
        select(Budget.id).where(
            Budget.user_id == user_id,
            Budget.category_id == payload.category_id,
            Budget.budget_year == year,
            Budget.budget_month == month,
        )
    )
    is_new = existing_result.scalar_one_or_none() is None

    if is_new and not is_premium:
        # Lock existing rows to prevent race condition on limit check
        await db.execute(
            select(Budget.id)
            .where(
                Budget.user_id == user_id,
                Budget.budget_year == year,
                Budget.budget_month == month,
            )
            .with_for_update()
        )
        count_result = await db.execute(
            select(func.count(Budget.id)).where(
                Budget.user_id == user_id,
                Budget.budget_year == year,
                Budget.budget_month == month,
            )
        )
        budget_count = count_result.scalar_one()
        if budget_count >= FREE_TIER_BUDGET_LIMIT:
            raise AppException(
                status_code=403,
                error_code="BUDGET_LIMIT_REACHED",
                message=(
                    f"Free tier allows up to {FREE_TIER_BUDGET_LIMIT} budgets per month. "
                    "Upgrade to CediSmart Pro for unlimited budgets."
                ),
            )

    # PostgreSQL UPSERT — atomic, no race condition on insert vs update
    stmt = (
        pg_insert(Budget)
        .values(
            user_id=user_id,
            category_id=payload.category_id,
            amount=payload.amount,
            budget_year=year,
            budget_month=month,
            alert_at_percent=payload.alert_at_percent,
        )
        .on_conflict_do_update(
            index_elements=None,
            constraint="uq_budgets_user_category_period",
            set_={
                "amount": payload.amount,
                "alert_at_percent": payload.alert_at_percent,
            },
        )
        .returning(Budget.id)
    )
    result = await db.execute(stmt)
    budget_id: uuid.UUID = result.scalar_one()

    await db.flush()

    # Reload the budget with category
    budget_result = await db.execute(select(Budget).where(Budget.id == budget_id))
    budget = budget_result.scalar_one()

    cat_result = await db.execute(select(Category).where(Category.id == budget.category_id))
    budget.category = cat_result.scalar_one()

    spent_map = await _compute_budget_progress(user_id, year, month, db, [budget_id])
    spent = spent_map.get(budget_id, Decimal("0"))

    await invalidate_budget_cache(user_id, year, month, redis)
    return _build_budget_response(budget, spent)


async def get_current_budgets(
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> list[dict]:
    """Optimised dashboard endpoint — returns current month budgets with progress.

    Results are cached in Redis for 5 minutes and invalidated on any budget
    or transaction write for this user.
    """
    year, month = _current_year_month()
    cache_key = _budget_cache_key(user_id, year, month)

    cached = await redis.get(cache_key)
    if cached:
        try:
            return json.loads(cached)  # type: ignore[return-value]
        except Exception:
            pass  # Cache corrupted — fall through to DB

    budgets = await list_budgets(user_id, db, year, month)

    # All values in the budget dicts are plain primitives — safe to serialise directly
    await redis.set(cache_key, json.dumps(budgets), ex=BUDGET_CACHE_TTL)
    return budgets


async def delete_budget(
    budget_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> None:
    """Hard-delete a budget (budgets are targets, not financial records).

    Returns 404 for missing or unowned budgets.
    """
    result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.user_id == user_id,
        )
    )
    budget = result.scalar_one_or_none()
    if budget is None:
        raise AppException(
            status_code=404,
            error_code="BUDGET_NOT_FOUND",
            message="Budget not found",
        )

    year, month = budget.budget_year, budget.budget_month
    await db.delete(budget)
    await db.flush()
    await invalidate_budget_cache(user_id, year, month, redis)
