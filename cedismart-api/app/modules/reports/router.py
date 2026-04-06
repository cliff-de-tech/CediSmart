"""Reports module — API router.

All endpoints live under ``/api/v1/reports`` (prefix set in ``main.py``).
Reports are read-only. Every endpoint requires a valid JWT access token.
"""

from datetime import date
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import get_redis
from app.modules.reports import service
from app.modules.reports.schemas import (
    CategoryReportResponse,
    MonthlyReportResponse,
    TrendsReportResponse,
)

router = APIRouter()

DBSession = Annotated[AsyncSession, Depends(get_db)]
RedisConn = Annotated[aioredis.Redis, Depends(get_redis)]


# ---------------------------------------------------------------------------
# GET /monthly
# ---------------------------------------------------------------------------


@router.get(
    "/monthly",
    response_model=MonthlyReportResponse,
    status_code=200,
    summary="Monthly income/expense summary",
)
async def get_monthly_report(
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> MonthlyReportResponse:
    """Return income, expense, net, top category, and activity count
    for a given month. Cached for 1 hour.
    """
    result = await service.get_monthly_report(
        user_id=user_id, year=year, month=month, db=db, redis=redis
    )
    return MonthlyReportResponse(**result)


# ---------------------------------------------------------------------------
# GET /categories
# ---------------------------------------------------------------------------


@router.get(
    "/categories",
    response_model=CategoryReportResponse,
    status_code=200,
    summary="Spending breakdown by category",
)
async def get_category_report(
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
    start_date: date = Query(...),
    end_date: date = Query(...),
    transaction_type: str = Query("expense", pattern="^(income|expense)$"),
) -> CategoryReportResponse:
    """Return aggregated amounts per category for a date range, ordered
    by amount descending, with percentages. Cached for 1 hour.
    """
    result = await service.get_category_report(
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        transaction_type=transaction_type,
        db=db,
        redis=redis,
    )
    return CategoryReportResponse(**result)


# ---------------------------------------------------------------------------
# GET /trends
# ---------------------------------------------------------------------------


@router.get(
    "/trends",
    response_model=TrendsReportResponse,
    status_code=200,
    summary="Month-over-month income/expense trend",
)
async def get_trends_report(
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
    months: int = Query(6, ge=1, le=12),
) -> TrendsReportResponse:
    """Return income/expense totals for the last N months (default 6, max 12).

    All months are present in the response even if they have zero transactions
    — frontend charts can render without gap-handling logic.
    """
    result = await service.get_trends_report(
        user_id=user_id, months=months, db=db, redis=redis
    )
    return TrendsReportResponse(**result)
