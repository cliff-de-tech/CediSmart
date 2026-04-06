"""Transactions module — business logic.

Business rules enforced here:
- Users can only access their own transactions (always filter by user_id from JWT).
- amount is always positive; transaction_type carries direction.
- transaction_date is user-provided — may differ from created_at.
- Soft delete only (is_deleted=True) — never DELETE FROM transactions.
- Bulk create is idempotent via client_id — skip silently if already exists.
- List queries always exclude is_deleted=True rows.
- Summary stats are cached in Redis for 5 minutes and invalidated on every write.
- All DB aggregation is in SQL — never loop and sum in Python.
"""

import asyncio
import json
import logging
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import redis.asyncio as aioredis
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import AppException
from app.modules.accounts.models import FinancialAccount
from app.modules.budgets.service import invalidate_budget_cache
from app.modules.categories.models import Category
from app.modules.reports.service import invalidate_report_cache
from app.modules.transactions.models import Transaction
from app.modules.transactions.schemas import (
    BulkCreateRequest,
    BulkErrorItem,
    TransactionCreateRequest,
    TransactionUpdateRequest,
)

logger = logging.getLogger(__name__)

SUMMARY_CACHE_TTL = 300  # 5 minutes
SUMMARY_CACHE_PREFIX = "txn:summary:"


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------


def _summary_cache_key(user_id: uuid.UUID) -> str:
    return f"{SUMMARY_CACHE_PREFIX}{user_id}"


async def _invalidate_caches(
    user_id: uuid.UUID,
    transaction_date: date,
    redis: aioredis.Redis,
) -> None:
    """Invalidate summary, budget, and report caches for the affected month."""
    await redis.delete(_summary_cache_key(user_id))
    await invalidate_budget_cache(user_id, transaction_date.year, transaction_date.month, redis)
    await invalidate_report_cache(user_id, transaction_date.year, transaction_date.month, redis)


# ---------------------------------------------------------------------------
# Ownership validators
# ---------------------------------------------------------------------------


async def _assert_account_owned(
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Raise 404 if the account doesn't exist or isn't owned by the user."""
    result = await db.execute(
        select(FinancialAccount.id).where(
            FinancialAccount.id == account_id,
            FinancialAccount.user_id == user_id,
            FinancialAccount.is_active.is_(True),
        )
    )
    if result.scalar_one_or_none() is None:
        raise AppException(
            status_code=404,
            error_code="ACCOUNT_NOT_FOUND",
            message="Account not found",
        )


async def _assert_category_accessible(
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Raise 404 if the category doesn't belong to the user and isn't a system category."""
    result = await db.execute(
        select(Category.id).where(
            Category.id == category_id,
            or_(
                Category.is_system.is_(True),
                Category.user_id == user_id,
            ),
        )
    )
    if result.scalar_one_or_none() is None:
        raise AppException(
            status_code=404,
            error_code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )


async def _get_transaction_or_404(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Transaction:
    """Return a non-deleted transaction owned by the user, or raise 404."""
    result = await db.execute(
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
        )
    )
    tx = result.scalar_one_or_none()
    if tx is None:
        raise AppException(
            status_code=404,
            error_code="TRANSACTION_NOT_FOUND",
            message="Transaction not found",
        )
    return tx


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def list_transactions(
    user_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    transaction_type: str | None = None,
) -> tuple[list[Transaction], int]:
    """Return a paginated, filtered list of transactions for the user.

    Returns a tuple of (transactions, total_count).
    Ordered by transaction_date DESC, then created_at DESC.
    Never returns soft-deleted records.
    """
    base = (
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
        )
    )

    if start_date is not None:
        base = base.where(Transaction.transaction_date >= start_date)
    if end_date is not None:
        base = base.where(Transaction.transaction_date <= end_date)
    if category_id is not None:
        base = base.where(Transaction.category_id == category_id)
    if account_id is not None:
        base = base.where(Transaction.account_id == account_id)
    if transaction_type is not None:
        base = base.where(Transaction.transaction_type == transaction_type)

    # Count total (without pagination)
    count_stmt = select(func.count()).select_from(base.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    # Paginate
    offset = (page - 1) * per_page
    paginated = (
        base.order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
        )
        .offset(offset)
        .limit(per_page)
    )

    rows = (await db.execute(paginated)).unique().scalars().all()
    return list(rows), total


async def get_transaction(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Transaction:
    """Return a single transaction with account and category loaded."""
    return await _get_transaction_or_404(transaction_id, user_id, db)


async def create_transaction(
    user_id: uuid.UUID,
    payload: TransactionCreateRequest,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> Transaction:
    """Create a new transaction.

    Validates that the account belongs to the user and the category is
    accessible (user-owned or system). Invalidates the summary cache.
    """
    await _assert_account_owned(payload.account_id, user_id, db)
    await _assert_category_accessible(payload.category_id, user_id, db)

    tx = Transaction(
        user_id=user_id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        amount=payload.amount,
        transaction_type=payload.transaction_type,
        description=payload.description,
        transaction_date=payload.transaction_date,
        notes=payload.notes,
        client_id=payload.client_id,
    )
    db.add(tx)

    try:
        await db.flush()
    except IntegrityError as e:
        raise AppException(
            status_code=409,
            error_code="DUPLICATE_CLIENT_ID",
            message="A transaction with this client_id already exists.",
            field="client_id",
        ) from e

    # Reload with relationships
    result = await db.execute(
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(Transaction.id == tx.id)
    )
    tx = result.scalar_one()

    await _invalidate_caches(user_id, tx.transaction_date, redis)
    return tx


async def update_transaction(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: TransactionUpdateRequest,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> Transaction:
    """Partial update of a transaction.

    account_id cannot be changed (excluded from the schema).
    Invalidates the summary cache.
    """
    tx = await _get_transaction_or_404(transaction_id, user_id, db)

    if payload.category_id is not None:
        await _assert_category_accessible(payload.category_id, user_id, db)
        tx.category_id = payload.category_id
    if payload.amount is not None:
        tx.amount = payload.amount
    if payload.transaction_type is not None:
        tx.transaction_type = payload.transaction_type
    if payload.description is not None:
        tx.description = payload.description
    if payload.transaction_date is not None:
        tx.transaction_date = payload.transaction_date
    if payload.notes is not None:
        tx.notes = payload.notes

    await db.flush()

    # Reload with relationships to reflect any category change
    result = await db.execute(
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(Transaction.id == tx.id)
    )
    tx = result.scalar_one()

    await _invalidate_caches(user_id, tx.transaction_date, redis)
    return tx


async def delete_transaction(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> None:
    """Soft-delete a transaction by setting is_deleted=True.

    Never issues a DELETE statement — financial records are immutable.
    Invalidates the summary cache.
    """
    tx = await _get_transaction_or_404(transaction_id, user_id, db)
    tx.is_deleted = True
    await db.flush()
    await _invalidate_caches(user_id, tx.transaction_date, redis)


async def bulk_create_transactions(
    user_id: uuid.UUID,
    payload: BulkCreateRequest,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict:
    """Idempotent bulk transaction create for offline sync.

    Each item requires a client_id. If a transaction with the same
    (user_id, client_id) already exists it is silently skipped.
    Per-item business logic errors are collected and returned rather than
    aborting the whole batch.

    Returns:
        Dict with keys: created (int), skipped (int), errors (list).
    """
    created = 0
    skipped = 0
    errors: list[BulkErrorItem] = []

    # --- Preload all valid IDs in 3 queries (not per-item) ---

    # 1. Existing client_ids — query only against incoming IDs to avoid full-table scan
    incoming_client_ids: set[uuid.UUID] = {
        item.client_id for item in payload.transactions if item.client_id is not None
    }
    if incoming_client_ids:
        existing_result = await db.execute(
            select(Transaction.client_id).where(
                Transaction.user_id == user_id,
                Transaction.client_id.in_(incoming_client_ids),
            )
        )
        existing_client_ids: set[uuid.UUID] = {row[0] for row in existing_result.all()}
    else:
        existing_client_ids = set()

    # 2. All active account IDs owned by this user
    accounts_result = await db.execute(
        select(FinancialAccount.id).where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.is_active.is_(True),
        )
    )
    valid_account_ids: set[uuid.UUID] = {row[0] for row in accounts_result.all()}

    # 3. All category IDs accessible to this user (own + system)
    categories_result = await db.execute(
        select(Category.id).where(
            or_(
                Category.is_system.is_(True),
                Category.user_id == user_id,
            )
        )
    )
    valid_category_ids: set[uuid.UUID] = {row[0] for row in categories_result.all()}

    affected_months: set[tuple[int, int]] = set()

    for item in payload.transactions:
        if item.client_id in existing_client_ids:
            skipped += 1
            continue

        if item.account_id not in valid_account_ids:
            errors.append(BulkErrorItem(client_id=item.client_id, reason="Account not found"))
            continue

        if item.category_id not in valid_category_ids:
            errors.append(BulkErrorItem(client_id=item.client_id, reason="Category not found"))
            continue

        tx = Transaction(
            user_id=user_id,
            account_id=item.account_id,
            category_id=item.category_id,
            amount=item.amount,
            transaction_type=item.transaction_type,
            description=item.description,
            transaction_date=item.transaction_date,
            notes=item.notes,
            client_id=item.client_id,
        )
        db.add(tx)
        existing_client_ids.add(item.client_id)  # prevent in-batch duplicates
        affected_months.add((item.transaction_date.year, item.transaction_date.month))
        created += 1

    if created > 0:
        await db.flush()
        # Invalidate caches concurrently for every distinct (year, month)
        # touched by created transactions
        await asyncio.gather(
            *[
                _invalidate_caches(user_id, date(year, month, 1), redis)
                for year, month in affected_months
            ]
        )

    return {"created": created, "skipped": skipped, "errors": errors}


async def get_summary(
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict:
    """Return income/expense summary for the current month vs. last month.

    All aggregation is done in a single SQL query using CASE WHEN.
    Results are cached in Redis for 5 minutes.
    """
    cache_key = _summary_cache_key(user_id)
    cached = await redis.get(cache_key)
    if cached:
        try:
            return json.loads(cached)  # type: ignore[return-value]
        except Exception:
            pass  # Cache corrupted — fall through to DB

    now = datetime.now(UTC)
    current_year, current_month = now.year, now.month

    # Compute last month
    if current_month == 1:
        last_year, last_month = current_year - 1, 12
    else:
        last_year, last_month = current_year, current_month - 1

    # Single query: aggregate both months in one pass
    income_current = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "income")
                    & (func.extract("year", Transaction.transaction_date) == current_year)
                    & (func.extract("month", Transaction.transaction_date) == current_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    expense_current = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "expense")
                    & (func.extract("year", Transaction.transaction_date) == current_year)
                    & (func.extract("month", Transaction.transaction_date) == current_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    income_last = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "income")
                    & (func.extract("year", Transaction.transaction_date) == last_year)
                    & (func.extract("month", Transaction.transaction_date) == last_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    expense_last = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "expense")
                    & (func.extract("year", Transaction.transaction_date) == last_year)
                    & (func.extract("month", Transaction.transaction_date) == last_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )

    stmt = select(
        income_current.label("income_current"),
        expense_current.label("expense_current"),
        income_last.label("income_last"),
        expense_last.label("expense_last"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
    )

    row = (await db.execute(stmt)).one()

    inc_cur = Decimal(str(row.income_current))
    exp_cur = Decimal(str(row.expense_current))
    inc_last = Decimal(str(row.income_last))
    exp_last = Decimal(str(row.expense_last))

    # Percentage changes — None when last month value was zero (avoids div/0)
    def _pct_change(current: Decimal, last: Decimal) -> float | None:
        if last == Decimal("0"):
            return None
        return float(((current - last) / last * 100).quantize(Decimal("0.01")))

    result = {
        "current_month": {
            "income": str(inc_cur.quantize(Decimal("0.01"))),
            "expense": str(exp_cur.quantize(Decimal("0.01"))),
            "net": str((inc_cur - exp_cur).quantize(Decimal("0.01"))),
        },
        "current_month_vs_last": {
            "income_change_pct": _pct_change(inc_cur, inc_last),
            "expense_change_pct": _pct_change(exp_cur, exp_last),
        },
    }

    await redis.set(cache_key, json.dumps(result), ex=SUMMARY_CACHE_TTL)
    return result
