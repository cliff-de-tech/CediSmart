"""Users module — API router.

All endpoints live under ``/api/v1/users`` (prefix set in ``main.py``).
Every endpoint requires a valid JWT access token via the CurrentUser dependency.
"""

from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import get_redis
from app.modules.users import service
from app.modules.users.schemas import UserResponse, UserUpdateRequest, KYCVerifyRequest, BugReportRequest, BugReportResponse

router = APIRouter()

DBSession = Annotated[AsyncSession, Depends(get_db)]
RedisConn = Annotated[aioredis.Redis, Depends(get_redis)]


# ---------------------------------------------------------------------------
# GET /me
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=200,
    summary="Get current user profile",
)
async def get_me(
    user_id: CurrentUser,
    db: DBSession,
) -> UserResponse:
    """Return the authenticated user's profile.

    Never returns pin_hash. Phone is included as it is the user's
    primary identity and they already know it.
    """
    user = await service.get_current_user(user_id=user_id, db=db)
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# PATCH /me
# ---------------------------------------------------------------------------


@router.patch(
    "/me",
    response_model=UserResponse,
    status_code=200,
    summary="Update profile",
)
async def update_me(
    body: UserUpdateRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> UserResponse:
    """Update mutable profile fields: full_name, email, currency.

    phone and PIN cannot be changed via this endpoint.
    """
    user = await service.update_current_user(user_id=user_id, payload=body, db=db)
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# DELETE /me
# ---------------------------------------------------------------------------


@router.delete(
    "/me",
    status_code=204,
    summary="Delete account (GDPR-style)",
)
async def delete_me(
    user_id: CurrentUser,
    db: DBSession,
    redis: RedisConn,
) -> None:
    """Permanently anonymise and deactivate the account.

    Personal data (phone, email, full_name) is scrubbed. Financial records
    are preserved in de-identified form. This action is irreversible.
    The current access token will be rejected on next use since
    is_active is set to False.
    """
    await service.delete_current_user(user_id=user_id, db=db, redis=redis)


# ---------------------------------------------------------------------------
# POST /verify-kyc
# ---------------------------------------------------------------------------


@router.post(
    "/verify-kyc",
    response_model=UserResponse,
    status_code=200,
    summary="Verify user identity with Ghana Card using Smile ID",
)
async def verify_kyc(
    body: KYCVerifyRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> UserResponse:
    """Verify current user identity using their Ghana Card.
    
    Verifies that the provided card number exists in the National Identification
    Authority (NIA) database via Smile ID, and that the name and DOB match.
    """
    user = await service.verify_user_kyc(user_id=user_id, payload=body, db=db)
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# POST /report-bug
# ---------------------------------------------------------------------------


@router.post(
    "/report-bug",
    response_model=BugReportResponse,
    status_code=200,
    summary="Report a bug and link to GitHub issue",
)
async def report_bug(
    body: BugReportRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> BugReportResponse:
    """Report a bug. Submits a GitHub issue or logs locally depending on config."""
    res = await service.report_user_bug(user_id=user_id, payload=body, db=db)
    return BugReportResponse(**res)

