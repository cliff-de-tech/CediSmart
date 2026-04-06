"""Accounts module — API router.

All endpoints live under ``/api/v1/accounts`` (prefix set in ``main.py``).
Every endpoint requires a valid JWT access token via the CurrentUser dependency.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.exceptions import AppException
from app.modules.accounts import service
from app.modules.accounts.schemas import (
    AccountCreateRequest,
    AccountDeactivatedResponse,
    AccountResponse,
    AccountUpdateRequest,
)
from app.modules.auth.models import User

router = APIRouter()

DBSession = Annotated[AsyncSession, Depends(get_db)]


async def _get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    """Fetch the full User record to check premium status."""
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
# GET /
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[AccountResponse],
    status_code=200,
    summary="List all active accounts with computed balances",
)
async def list_accounts(
    user_id: CurrentUser,
    db: DBSession,
) -> list[AccountResponse]:
    """Return all active accounts for the current user.

    Each account includes a real-time computed balance
    (opening_balance + income - expense) via a single SQL query.
    """
    accounts = await service.list_accounts(user_id=user_id, db=db)
    return [AccountResponse(**a) for a in accounts]


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=AccountResponse,
    status_code=201,
    summary="Create a new financial account",
)
async def create_account(
    body: AccountCreateRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> AccountResponse:
    """Create a bank, mobile money, or cash account.

    Free tier limited to 3 active accounts.
    ``opening_balance`` and ``account_type`` cannot be changed after creation.
    """
    user = await _get_user(user_id, db)
    account = await service.create_account(
        user_id=user_id,
        payload=body,
        is_premium=user.is_premium,
        db=db,
    )
    return AccountResponse(**account)


# ---------------------------------------------------------------------------
# GET /{id}
# ---------------------------------------------------------------------------


@router.get(
    "/{account_id}",
    response_model=AccountResponse,
    status_code=200,
    summary="Get account detail with computed balance",
)
async def get_account(
    account_id: uuid.UUID,
    user_id: CurrentUser,
    db: DBSession,
) -> AccountResponse:
    """Return a single account with its computed balance.

    Returns 404 for both missing and unowned accounts.
    """
    account = await service.get_account(
        account_id=account_id,
        user_id=user_id,
        db=db,
    )
    return AccountResponse(**account)


# ---------------------------------------------------------------------------
# PATCH /{id}
# ---------------------------------------------------------------------------


@router.patch(
    "/{account_id}",
    response_model=AccountResponse,
    status_code=200,
    summary="Update account name or provider",
)
async def update_account(
    account_id: uuid.UUID,
    body: AccountUpdateRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> AccountResponse:
    """Update mutable fields on an account (name, provider).

    ``opening_balance`` and ``account_type`` are intentionally excluded from
    the request schema — they cannot be changed after creation.
    """
    account = await service.update_account(
        account_id=account_id,
        user_id=user_id,
        payload=body,
        db=db,
    )
    return AccountResponse(**account)


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{account_id}",
    status_code=200,
    response_model=None,
    summary="Delete or deactivate an account",
    responses={
        204: {"description": "Account permanently deleted (no transactions)"},
        200: {"description": "Account deactivated (has transactions)"},
    },
)
async def delete_account(
    account_id: uuid.UUID,
    user_id: CurrentUser,
    db: DBSession,
    response: Response,
) -> AccountDeactivatedResponse | Response:
    """Delete an account.

    - **No transactions**: hard delete, returns 204 No Content.
    - **Has transactions**: soft delete (``is_active=False``), returns 200
      with a message. Financial history is preserved.
    """
    hard_deleted = await service.delete_account(
        account_id=account_id,
        user_id=user_id,
        db=db,
    )
    if hard_deleted:
        response.status_code = 204
        return Response(status_code=204)

    return AccountDeactivatedResponse(message="Account deactivated. Transaction history preserved.")
