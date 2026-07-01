"""Auth module — API router with rate limiting.

All endpoints live under ``/api/v1/auth`` (prefix set in ``main.py``).
Rate limiting is applied via ``slowapi`` at the endpoint level.
"""

from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import get_redis
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    MessageResponse,
    PinResetConfirmRequest,
    RegisterClerkRequest,
    TokenRefreshRequest,
    TokenRefreshResponse,
    TokenResponse,
)

router = APIRouter()

# slowapi limiter — keyed by remote IP address
limiter = Limiter(key_func=get_remote_address)

# Type aliases for dependency injection
RedisConn = Annotated[aioredis.Redis, Depends(get_redis)]
DBSession = Annotated[AsyncSession, Depends(get_db)]


# ---------------------------------------------------------------------------
# POST /register/clerk
# ---------------------------------------------------------------------------


@router.post(
    "/register/clerk",
    response_model=TokenResponse,
    status_code=201,
    summary="Complete registration after Clerk verification",
)
async def register_clerk(
    body: RegisterClerkRequest,
    db: DBSession,
    redis: RedisConn,
) -> TokenResponse:
    """Verify the Clerk session, create user, and return JWT tokens."""
    tokens = await service.register_with_clerk(
        phone=body.phone,
        pin=body.pin,
        full_name=body.full_name,
        clerk_user_id=body.clerk_user_id,
        db=db,
        redis=redis,
    )
    return TokenResponse(**tokens)


# ---------------------------------------------------------------------------
# POST /login
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=200,
    summary="Login with phone + PIN",
)
@limiter.limit("30/15minutes")
async def login(
    request: Request,
    body: LoginRequest,
    db: DBSession,
    redis: RedisConn,
) -> TokenResponse:
    """Authenticate with phone number and 6-digit PIN.

    Rate limited to **5 attempts per 15 minutes** per IP.
    Returns generic error on failure — does not reveal if phone exists.
    """
    tokens = await service.login(
        phone=body.phone,
        pin=body.pin,
        db=db,
        redis=redis,
    )
    return TokenResponse(**tokens)


# ---------------------------------------------------------------------------
# POST /token/refresh
# ---------------------------------------------------------------------------


@router.post(
    "/token/refresh",
    response_model=TokenRefreshResponse,
    status_code=200,
    summary="Refresh access token",
)
async def token_refresh(
    body: TokenRefreshRequest,
    redis: RedisConn,
) -> TokenRefreshResponse:
    """Exchange a valid refresh token for a new access token.

    The refresh token must exist in Redis (not revoked) and have a valid
    RS256 signature.
    """
    new_access_token = await service.refresh_access_token(
        refresh_token_str=body.refresh_token,
        redis=redis,
    )
    return TokenRefreshResponse(
        access_token=new_access_token,
        refresh_token=body.refresh_token,
        token_type="bearer",
    )


# ---------------------------------------------------------------------------
# POST /logout
# ---------------------------------------------------------------------------


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=200,
    summary="Logout and revoke refresh token",
)
async def logout(
    body: TokenRefreshRequest,
    user_id: CurrentUser,
    redis: RedisConn,
) -> MessageResponse:
    """Invalidate the provided refresh token.

    Requires a valid access token (``Authorization: Bearer ...``).
    The refresh token is removed from Redis so it can no longer be used.
    """
    await service.logout(
        user_id=user_id,
        refresh_token_str=body.refresh_token,
        redis=redis,
    )
    return MessageResponse(message="Logged out")


# ---------------------------------------------------------------------------
# POST /pin/reset/confirm
# ---------------------------------------------------------------------------


@router.post(
    "/pin/reset/confirm",
    response_model=MessageResponse,
    status_code=200,
    summary="Verify Clerk ID and set new PIN",
)
@limiter.limit("30/15minutes")
async def pin_reset_confirm(
    request: Request,
    body: PinResetConfirmRequest,
    db: DBSession,
) -> MessageResponse:
    """Verify the Clerk verification session and replace the user's PIN."""
    await service.confirm_pin_reset(
        phone=body.phone,
        clerk_user_id=body.clerk_user_id,
        new_pin=body.new_pin,
        db=db,
    )
    return MessageResponse(message="PIN updated successfully")
