"""Auth module — API router with rate limiting.

All endpoints live under ``/api/v1/auth`` (prefix set in ``main.py``).
Rate limiting is applied via ``slowapi`` at the endpoint level.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import get_redis
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    MessageResponse,
    PinResetConfirmRequest,
    PinResetInitiateRequest,
    RegisterInitiateRequest,
    RegisterVerifyRequest,
    TokenRefreshRequest,
    TokenResponse,
)

router = APIRouter()

# slowapi limiter — keyed by remote IP address
limiter = Limiter(key_func=get_remote_address)

# Type aliases for dependency injection
RedisConn = Annotated[aioredis.Redis, Depends(get_redis)]
DBSession = Annotated[AsyncSession, Depends(get_db)]


# ---------------------------------------------------------------------------
# POST /register/initiate
# ---------------------------------------------------------------------------


@router.post(
    "/register/initiate",
    response_model=MessageResponse,
    status_code=200,
    summary="Send OTP to phone number",
)
@limiter.limit("3/15minutes")
async def register_initiate(
    request: Request,
    body: RegisterInitiateRequest,
    redis: RedisConn,
) -> MessageResponse:
    """Start the registration flow by sending a 6-digit OTP via SMS.

    Rate limited to **3 requests per 15 minutes** per IP to prevent abuse.
    """
    expires_in = await service.initiate_registration(
        phone=body.phone,
        redis=redis,
    )
    return MessageResponse(message="OTP sent", expires_in=expires_in)


# ---------------------------------------------------------------------------
# POST /register/verify
# ---------------------------------------------------------------------------


@router.post(
    "/register/verify",
    response_model=TokenResponse,
    status_code=201,
    summary="Verify OTP and complete registration",
)
async def register_verify(
    body: RegisterVerifyRequest,
    db: DBSession,
    redis: RedisConn,
) -> TokenResponse:
    """Verify the OTP, create the user account, and return JWT tokens."""
    tokens = await service.verify_registration(
        phone=body.phone,
        otp=body.otp,
        pin=body.pin,
        full_name=body.full_name,
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
@limiter.limit("5/15minutes")
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
    response_model=TokenResponse,
    status_code=200,
    summary="Refresh access token",
)
async def token_refresh(
    body: TokenRefreshRequest,
    redis: RedisConn,
) -> TokenResponse:
    """Exchange a valid refresh token for a new access token.

    The refresh token must exist in Redis (not revoked) and have a valid
    RS256 signature.
    """
    new_access_token = await service.refresh_access_token(
        refresh_token_str=body.refresh_token,
        redis=redis,
    )
    return TokenResponse(
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
# POST /pin/reset/initiate
# ---------------------------------------------------------------------------


@router.post(
    "/pin/reset/initiate",
    response_model=MessageResponse,
    status_code=200,
    summary="Send PIN reset OTP",
)
@limiter.limit("3/15minutes")
async def pin_reset_initiate(
    request: Request,
    body: PinResetInitiateRequest,
    db: DBSession,
    redis: RedisConn,
) -> MessageResponse:
    """Trigger a PIN reset OTP for the given phone number.

    Response is identical whether or not the phone is registered — phone
    existence is never revealed.

    Rate limited to **3 requests per 15 minutes** per IP.
    """
    expires_in = await service.initiate_pin_reset(
        phone=body.phone,
        db=db,
        redis=redis,
    )
    return MessageResponse(message="If this number is registered, an OTP has been sent", expires_in=expires_in)


# ---------------------------------------------------------------------------
# POST /pin/reset/confirm
# ---------------------------------------------------------------------------


@router.post(
    "/pin/reset/confirm",
    response_model=MessageResponse,
    status_code=200,
    summary="Verify OTP and set new PIN",
)
@limiter.limit("5/15minutes")
async def pin_reset_confirm(
    request: Request,
    body: PinResetConfirmRequest,
    db: DBSession,
    redis: RedisConn,
) -> MessageResponse:
    """Verify the PIN-reset OTP and replace the user's PIN.

    The OTP is single-use and expires after 5 minutes.
    Rate limited to **5 attempts per 15 minutes** per IP.
    """
    await service.confirm_pin_reset(
        phone=body.phone,
        otp=body.otp,
        new_pin=body.new_pin,
        db=db,
        redis=redis,
    )
    return MessageResponse(message="PIN updated successfully")
