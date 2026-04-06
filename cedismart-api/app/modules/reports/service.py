"""Reports module — business logic.

Principles enforced here:
- ALL aggregation happens in SQL (PostgreSQL) — never loop and sum in Python.
- All amounts are returned as strings to preserve decimal precision in JSON.
- All report queries are filtered by user_id from JWT.
- Date ranges are validated to prevent absurdly large ranges (max 12 months).
- Results are cached in Redis with a 1-hour TTL, namespaced by user_id.
- Cache invalidation is triggered by transaction writes (see transactions/service.py).
"""

import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

import redis.asyncio as aioredis
from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.categories.models import Category
from app.modules.transactions.models import Transaction

REPORT_CACHE_TTL = 3600  # 1 hour
REPORT_CACHE_PREFIX = "report:"


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------


def _cache_key(report_type: str, user_id: uuid.UUID, *parts: object) -> str:
    suffix = ":".join(str(p) for p in parts)
    return f"{REPORT_CACHE_PREFIX}{report_type}:{user_id}:{suffix}"


async def _get_cached(key: str, redis: aioredis.Redis) -> Optional[dict]:
    cached = await redis.get(key)
    if cached:
        try:
            return json.loads(cached)  # type: ignore[return-value]
        except Exception:
            pass
    return None


async def _set_cached(key: str, data: object, redis: aioredis.Redis) -> None:
    await redis.set(key, json.dumps(data), ex=REPORT_CACHE_TTL)


async def invalidate_report_cache(
    user_id: uuid.UUID,
    year: int,
    month: int,
    redis: aioredis.Redis,
) -> None:
    """Invalidate the monthly report cache for a specific user + period.

    Called from transactions/service.py on every write operation.
    Uses a pattern delete to catch all report types for this user+period.
    """
    # Delete the exact monthly key
    monthly_key = _cache_key("monthly", user_id, year, month)
    await redis.delete(monthly_key)

    # Category and trends caches are date-range based, not period-based.
    # Invalidate each report type for this user with anchored patterns.
    for report_type in ("categories", "trends"):
        pattern = f"{REPORT_CACHE_PREFIX}{report_type}:{user_id}:*"
        async for key in redis.scan_iter(match=pattern, count=100):
            await redis.delete(key)


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def get_monthly_report(
    user_id: uuid.UUID,
    year: int,
    month: int,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict:
    """Monthly income/expense summary with top category and activity count.

    Single SQL query using SUM + CASE WHEN for income/expense split.
    Cached in Redis for 1 hour.
    """
    cache_key = _cache_key("monthly", user_id, year, month)
    cached = await _get_cached(cache_key, redis)
    if cached:
        return cached

    # Aggregate income, expense, count, and distinct active days in one query
    stmt = select(
        func.coalesce(
            func.sum(
                case(
                    (Transaction.transaction_type == "income", Transaction.amount),
                    else_=Decimal("0"),
                )
            ),
            Decimal("0"),
        ).label("total_income"),
        func.coalesce(
            func.sum(
                case(
                    (Transaction.transaction_type == "expense", Transaction.amount),
                    else_=Decimal("0"),
                )
            ),
            Decimal("0"),
        ).label("total_expense"),
        func.count(Transaction.id).label("transaction_count"),
        func.count(func.distinct(Transaction.transaction_date)).label("days_with_activity"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
        func.extract("year", Transaction.transaction_date) == year,
        func.extract("month", Transaction.transaction_date) == month,
    )

    row = (await db.execute(stmt)).one()

    income = Decimal(str(row.total_income))
    expense = Decimal(str(row.total_expense))

    # Top expense category — separate query with GROUP BY + ORDER BY + LIMIT 1
    top_cat_stmt = (
        select(
            Category.id,
            Category.name,
            func.sum(Transaction.amount).label("cat_total"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .where(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
            Transaction.transaction_type == "expense",
            func.extract("year", Transaction.transaction_date) == year,
            func.extract("month", Transaction.transaction_date) == month,
        )
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(1)
    )
    top_cat_row = (await db.execute(top_cat_stmt)).one_or_none()

    top_expense_category = None
    if top_cat_row is not None:
        top_expense_category = {
            "id": str(top_cat_row.id),
            "name": top_cat_row.name,
            "amount": str(Decimal(str(top_cat_row.cat_total)).quantize(Decimal("0.01"))),
        }

    result = {
        "period": f"{year}-{month:02d}",
        "total_income": str(income.quantize(Decimal("0.01"))),
        "total_expense": str(expense.quantize(Decimal("0.01"))),
        "net": str((income - expense).quantize(Decimal("0.01"))),
        "transaction_count": row.transaction_count,
        "top_expense_category": top_expense_category,
        "days_with_activity": row.days_with_activity,
    }

    await _set_cached(cache_key, result, redis)
    return result


async def get_category_report(
    user_id: uuid.UUID,
    start_date: date,
    end_date: date,
    transaction_type: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict:
    """Spending breakdown by category for a date range.

    Uses GROUP BY with SUM and computes percentage via a SQL window function.
    Cached in Redis for 1 hour.
    """
    # Validate date range — max 12 months to prevent absurdly large queries
    delta = (end_date - start_date).days
    if delta < 0:
        raise AppException(
            status_code=400,
            error_code="INVALID_DATE_RANGE",
            message="end_date must be after start_date.",
        )
    if delta > 366:
        raise AppException(
            status_code=400,
            error_code="DATE_RANGE_TOO_LARGE",
            message="Date range cannot exceed 12 months.",
        )

    cache_key = _cache_key(
        "categories", user_id, start_date.isoformat(), end_date.isoformat(), transaction_type
    )
    cached = await _get_cached(cache_key, redis)
    if cached:
        return cached

    # Aggregate by category with percentage computed via window function
    cat_total = func.sum(Transaction.amount).label("cat_amount")
    grand_total = func.sum(func.sum(Transaction.amount)).over().label("grand_total")

    stmt = (
        select(
            Category.id,
            Category.name,
            Category.color,
            Category.icon,
            cat_total,
            grand_total,
            func.count(Transaction.id).label("tx_count"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .where(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
            Transaction.transaction_type == transaction_type,
            Transaction.transaction_date >= start_date,
            Transaction.transaction_date <= end_date,
        )
        .group_by(Category.id, Category.name, Category.color, Category.icon)
        .order_by(func.sum(Transaction.amount).desc())
    )

    rows = (await db.execute(stmt)).all()

    total = Decimal("0")
    categories_list = []
    for row in rows:
        amount = Decimal(str(row.cat_amount))
        g_total = Decimal(str(row.grand_total))
        total = g_total  # same for all rows (window function)
        pct = (amount / g_total * 100).quantize(Decimal("0.01")) if g_total > 0 else Decimal("0")

        categories_list.append({
            "id": str(row.id),
            "name": row.name,
            "color": row.color,
            "icon": row.icon,
            "amount": str(amount.quantize(Decimal("0.01"))),
            "percentage": str(pct),
            "transaction_count": row.tx_count,
        })

    result = {
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "total": str(total.quantize(Decimal("0.01"))),
        "categories": categories_list,
    }

    await _set_cached(cache_key, result, redis)
    return result


async def get_trends_report(
    user_id: uuid.UUID,
    months: int,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict:
    """Month-over-month income/expense trend for the last N months.

    Uses generate_series to ensure all months are present even if they
    have zero transactions — prevents gaps in frontend charts.
    Amounts returned as "0.00" (never null) for empty months.
    """
    cache_key = _cache_key("trends", user_id, months)
    cached = await _get_cached(cache_key, redis)
    if cached:
        return cached

    now = datetime.now(timezone.utc)

    # Compute the start month (N months ago, inclusive of current)
    # E.g., months=6 and current = 2026-04 → start from 2025-11
    start_year = now.year
    start_month = now.month - months + 1
    while start_month <= 0:
        start_month += 12
        start_year -= 1

    start_date = date(start_year, start_month, 1)

    # generate_series produces one row per month — guarantees no gaps.
    # Use a single generate_series call via a lateral subquery to avoid
    # the set-returning-function-per-column cross-product issue.
    month_col = func.generate_series(
        start_date,
        date(now.year, now.month, 1),
        text("INTERVAL '1 month'"),
    ).column_valued("m")

    series = (
        select(
            func.extract("year", month_col).label("m_year"),
            func.extract("month", month_col).label("m_month"),
        )
    ).subquery("months_series")

    income_sum = func.coalesce(
        func.sum(
            case(
                (Transaction.transaction_type == "income", Transaction.amount),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    expense_sum = func.coalesce(
        func.sum(
            case(
                (Transaction.transaction_type == "expense", Transaction.amount),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )

    stmt = (
        select(
            series.c.m_year,
            series.c.m_month,
            income_sum.label("income"),
            expense_sum.label("expense"),
        )
        .outerjoin(
            Transaction,
            (func.extract("year", Transaction.transaction_date) == series.c.m_year)
            & (func.extract("month", Transaction.transaction_date) == series.c.m_month)
            & (Transaction.user_id == user_id)
            & (Transaction.is_deleted.is_(False)),
        )
        .group_by(series.c.m_year, series.c.m_month)
        .order_by(series.c.m_year, series.c.m_month)
    )

    rows = (await db.execute(stmt)).all()

    months_list = []
    for row in rows:
        inc = Decimal(str(row.income))
        exp = Decimal(str(row.expense))
        months_list.append({
            "year": int(row.m_year),
            "month": int(row.m_month),
            "income": str(inc.quantize(Decimal("0.01"))),
            "expense": str(exp.quantize(Decimal("0.01"))),
            "net": str((inc - exp).quantize(Decimal("0.01"))),
        })

    result = {"months": months_list}

    await _set_cached(cache_key, result, redis)
    return result
