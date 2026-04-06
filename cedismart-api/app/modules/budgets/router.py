"""Budgets module — API router.

All endpoints live under ``/api/v1/budgets`` (prefix set in ``main.py``).
Every endpoint requires a valid JWT access token via the CurrentUser dependency.

IMPORTANT: ``GET /current`` is declared before ``GET /{id}`` (not applicable here
since we have no GET /{id}, but kept as a note for future additions).
"""

import uuid
from typing import Annotated, Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.exceptions import AppException
from app.core.redis import get_redis
from app.modules.auth.models import User
from app.modules.budgets import service
from app.modules.budgets.schemas import BudgetResponse, BudgetUpsertRequest
from sqlalchemy import select

router = APIRouter()

DBSession = Annotated[AsyncSession, Depends(get_db)]
RedisConn = Annotated[aioredis.Redis, Depends(get_redis)]


async def _get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppException(
            status_code=401,
            error_code="USER_NOT_FOUND",
            message="Authenticated user not found",
        )
    return user


# ---------------------------------------------------------------------------
# GET /current  — must be before /{id} if /{id} is ever added
# ---------------------------------------------------------------------------


@router.get(
    "/current",
    response_model=list[BudgetResponse],
    status_code=200,
    summary="Current month budgets with spent amounts (dashboard)",
)
async def get_current_budgets(
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> list[BudgetResponse]:
    """Return current month budgets with computed progress. Cached 5 minutes."""
    budgets = await service.get_current_budgets(user_id=user_id, db=db, redis=redis)
    return [BudgetResponse(**b) for b in budgets]


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[BudgetResponse],
    status_code=200,
    summary="List budgets for a given month",
)
async def list_budgets(
    user_id: CurrentUser,
    db: DBSession,
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
) -> list[BudgetResponse]:
    """Return budgets for the specified month (defaults to current month).

    Each budget includes real-time computed spent amount and percentage.
    """
    budgets = await service.list_budgets(
        user_id=user_id, db=db, year=year, month=month
    )
    return [BudgetResponse(**b) for b in budgets]


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=BudgetResponse,
    status_code=200,
    summary="Create or update a budget (upsert)",
)
async def upsert_budget(
    body: BudgetUpsertRequest,
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> BudgetResponse:
    """Create or update a monthly budget for an expense category.

    If a budget for the same (category, year, month) already exists it is
    updated — no 409. Free tier limited to 5 budgets per month.
    """
    user = await _get_user(user_id, db)
    budget = await service.upsert_budget(
        user_id=user_id,
        payload=body,
        is_premium=user.is_premium,
        db=db,
        redis=redis,
    )
    return BudgetResponse(**budget)


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{budget_id}",
    status_code=204,
    summary="Delete a budget",
)
async def delete_budget(
    budget_id: uuid.UUID,
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> None:
    """Hard-delete a budget. Returns 404 for missing or unowned budgets."""
    await service.delete_budget(
        budget_id=budget_id,
        user_id=user_id,
        db=db,
        redis=redis,
    )
