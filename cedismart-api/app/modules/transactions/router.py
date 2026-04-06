"""Transactions module — API router.

All endpoints live under ``/api/v1/transactions`` (prefix set in ``main.py``).
Every endpoint requires a valid JWT access token via the CurrentUser dependency.

IMPORTANT: ``GET /summary`` is declared before ``GET /{id}`` so FastAPI does
not try to parse the literal string "summary" as a UUID.
"""

import uuid
from datetime import date
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import get_redis
from app.modules.transactions import service
from app.modules.transactions.schemas import (
    BulkCreateRequest,
    BulkCreateResponse,
    PaginationMeta,
    TransactionCreateRequest,
    TransactionListResponse,
    TransactionResponse,
    TransactionSummaryResponse,
    TransactionUpdateRequest,
)

router = APIRouter()

DBSession = Annotated[AsyncSession, Depends(get_db)]
RedisConn = Annotated[aioredis.Redis, Depends(get_redis)]


# ---------------------------------------------------------------------------
# GET /summary  — must be declared BEFORE /{id}
# ---------------------------------------------------------------------------


@router.get(
    "/summary",
    response_model=TransactionSummaryResponse,
    status_code=200,
    summary="Current month income/expense summary",
)
async def get_summary(
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> TransactionSummaryResponse:
    """Return income, expense, and net for the current month with
    month-over-month percentage changes. Cached for 5 minutes.
    """
    result = await service.get_summary(user_id=user_id, db=db, redis=redis)
    return TransactionSummaryResponse(**result)


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=TransactionListResponse,
    status_code=200,
    summary="List transactions (paginated + filtered)",
)
async def list_transactions(
    user_id: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: uuid.UUID | None = Query(None),
    account_id: uuid.UUID | None = Query(None),
    transaction_type: str | None = Query(None, pattern="^(income|expense|transfer)$"),
) -> TransactionListResponse:
    """Return a paginated list of transactions ordered by date descending.

    Supports filtering by date range, category, account, and transaction type.
    Soft-deleted transactions are never returned.
    """
    transactions, total = await service.list_transactions(
        user_id=user_id,
        db=db,
        page=page,
        per_page=per_page,
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        account_id=account_id,
        transaction_type=transaction_type,
    )
    return TransactionListResponse(
        data=[TransactionResponse.model_validate(t) for t in transactions],
        pagination=PaginationMeta(page=page, per_page=per_page, total=total),
    )


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=TransactionResponse,
    status_code=201,
    summary="Create a transaction",
)
async def create_transaction(
    body: TransactionCreateRequest,
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> TransactionResponse:
    """Create an income, expense, or transfer transaction.

    ``amount`` must be positive. Direction is determined by ``transaction_type``.
    ``transaction_date`` is user-provided and may be in the past.
    Supply ``client_id`` (UUID) for offline sync deduplication.
    """
    tx = await service.create_transaction(
        user_id=user_id,
        payload=body,
        db=db,
        redis=redis,
    )
    return TransactionResponse.model_validate(tx)


# ---------------------------------------------------------------------------
# POST /bulk
# ---------------------------------------------------------------------------


@router.post(
    "/bulk",
    response_model=BulkCreateResponse,
    status_code=200,
    summary="Bulk create transactions (offline sync)",
)
async def bulk_create_transactions(
    body: BulkCreateRequest,
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> BulkCreateResponse:
    """Idempotent bulk create for offline sync (max 100 per call).

    Each item must include a ``client_id``. Transactions whose ``client_id``
    already exists for this user are silently skipped. Per-item errors
    (invalid account, inaccessible category) are collected and returned
    without aborting the whole batch.
    """
    result = await service.bulk_create_transactions(
        user_id=user_id,
        payload=body,
        db=db,
        redis=redis,
    )
    return BulkCreateResponse(**result)


# ---------------------------------------------------------------------------
# GET /{id}
# ---------------------------------------------------------------------------


@router.get(
    "/{transaction_id}",
    response_model=TransactionResponse,
    status_code=200,
    summary="Get transaction detail",
)
async def get_transaction(
    transaction_id: uuid.UUID,
    user_id: CurrentUser,
    db: DBSession,
) -> TransactionResponse:
    """Return a single transaction.

    Returns 404 for both missing and unowned transactions.
    """
    tx = await service.get_transaction(
        transaction_id=transaction_id,
        user_id=user_id,
        db=db,
    )
    return TransactionResponse.model_validate(tx)


# ---------------------------------------------------------------------------
# PATCH /{id}
# ---------------------------------------------------------------------------


@router.patch(
    "/{transaction_id}",
    response_model=TransactionResponse,
    status_code=200,
    summary="Update a transaction",
)
async def update_transaction(
    transaction_id: uuid.UUID,
    body: TransactionUpdateRequest,
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> TransactionResponse:
    """Partial update — only provided fields are changed.

    ``account_id`` cannot be changed after creation (excluded from schema).
    Invalidates the summary cache.
    """
    tx = await service.update_transaction(
        transaction_id=transaction_id,
        user_id=user_id,
        payload=body,
        db=db,
        redis=redis,
    )
    return TransactionResponse.model_validate(tx)


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{transaction_id}",
    status_code=204,
    summary="Soft-delete a transaction",
)
async def delete_transaction(
    transaction_id: uuid.UUID,
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> None:
    """Soft-delete a transaction (sets ``is_deleted=True``).

    Financial records are never hard-deleted. The record remains in the
    database but is excluded from all queries and balance calculations.
    """
    await service.delete_transaction(
        transaction_id=transaction_id,
        user_id=user_id,
        db=db,
        redis=redis,
    )
