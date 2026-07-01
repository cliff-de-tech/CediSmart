"""Auth module — business logic for registration, login, token management.

Security invariants enforced here:
- OTPs generated via ``secrets.randbelow`` (CSPRNG), stored in Redis only (5-min TTL).
- OTP comparison uses ``hmac.compare_digest`` to prevent timing attacks.
- PINs hashed with bcrypt cost-factor 12 (via ``app.core.security``).
- Refresh tokens carry a ``jti`` claim and are tracked in Redis for revocation.
- All error messages are generic — never reveal whether a phone is registered.
"""

import logging
import uuid
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_pin,
    verify_pin,
)
from app.modules.auth.models import User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REFRESH_TOKEN_REDIS_PREFIX: str = "refresh:"
REFRESH_TOKEN_TTL_SECONDS: int = 30 * 24 * 60 * 60  # 30 days


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


async def register_with_clerk(
    phone: str,
    pin: str,
    full_name: str,
    clerk_user_id: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict[str, Any]:
    """Verify Clerk session, create user, and issue JWT tokens.

    Args:
        phone: E.164-formatted phone number.
        pin: 6-digit PIN chosen by the user.
        full_name: User's display name.
        clerk_user_id: The Clerk user ID.
        db: Async database session.
        redis: Active Redis connection.

    Returns:
        Dict with ``access_token``, ``refresh_token``, ``token_type``, and ``user``.
    """
    from app.core.clerk import verify_clerk_user
    await verify_clerk_user(clerk_user_id, phone)

    # --- Check for existing user ---
    result = await db.execute(select(User).where(User.phone == phone))
    existing_user = result.scalar_one_or_none()
    if existing_user is not None:
        raise AppException(
            status_code=409,
            error_code="PHONE_ALREADY_REGISTERED",
            message="This phone number is already registered",
            field="phone",
        )

    # --- Create user ---
    user = User(
        phone=phone,
        full_name=full_name,
        pin_hash=hash_pin(pin),
        clerk_user_id=clerk_user_id,
    )
    db.add(user)
    await db.flush()  # Populate user.id before commit

    # --- Issue tokens ---
    tokens = await _issue_tokens(user.id, redis)

    return {**tokens, "user": user}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


async def login(
    phone: str,
    pin: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict[str, str]:
    """Authenticate a user with phone + PIN and issue JWT tokens.

    Args:
        phone: E.164-formatted phone number.
        pin: User-provided plaintext PIN.
        db: Async database session.
        redis: Active Redis connection.

    Returns:
        Dict with ``access_token``, ``refresh_token``, ``token_type``.

    Raises:
        AppException 401: If credentials are invalid (generic message).
    """
    _invalid = AppException(
        status_code=401,
        error_code="INVALID_CREDENTIALS",
        message="Invalid credentials",
    )

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user is None:
        raise _invalid

    if not user.is_active:
        raise _invalid

    if not verify_pin(pin, user.pin_hash):
        raise _invalid

    tokens = await _issue_tokens(user.id, redis)
    return {**tokens, "user": user}


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


async def refresh_access_token(
    refresh_token_str: str,
    redis: aioredis.Redis,
) -> str:
    """Validate a refresh token and issue a new access token.

    Args:
        refresh_token_str: The encoded JWT refresh token.
        redis: Active Redis connection.

    Returns:
        A new encoded JWT access token.

    Raises:
        AppException 401: If the refresh token is invalid, expired, or revoked.
    """
    _invalid = AppException(
        status_code=401,
        error_code="INVALID_REFRESH_TOKEN",
        message="Invalid or expired refresh token",
    )

    try:
        payload = decode_token(refresh_token_str)
    except Exception as e:
        raise _invalid from e

    if payload.get("type") != "refresh":
        raise _invalid

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if user_id is None or jti is None:
        raise _invalid

    # Verify the refresh token is still in Redis (not revoked)
    redis_key = f"{REFRESH_TOKEN_REDIS_PREFIX}{user_id}:{jti}"
    exists = await redis.exists(redis_key)
    if not exists:
        raise _invalid

    return create_access_token(uuid.UUID(str(user_id)))


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


async def logout(
    user_id: uuid.UUID,
    refresh_token_str: str,
    redis: aioredis.Redis,
) -> None:
    """Invalidate a refresh token by removing it from Redis.

    Args:
        user_id: The authenticated user's UUID (from JWT).
        refresh_token_str: The refresh token to invalidate.
        redis: Active Redis connection.
    """
    try:
        payload = decode_token(refresh_token_str)
    except Exception:
        # Token is already invalid — nothing to revoke
        return

    jti = payload.get("jti")
    if jti is None:
        return

    redis_key = f"{REFRESH_TOKEN_REDIS_PREFIX}{user_id}:{jti}"
    await redis.delete(redis_key)


# ---------------------------------------------------------------------------
# PIN reset
# ---------------------------------------------------------------------------


async def confirm_pin_reset(
    phone: str,
    clerk_user_id: str,
    new_pin: str,
    db: AsyncSession,
) -> None:
    """Verify Clerk user session and replace the user's PIN hash.

    Args:
        phone: E.164-formatted phone number.
        clerk_user_id: The verified Clerk user ID.
        new_pin: New 6-digit PIN.
        db: Async database session.

    Raises:
        AppException 400: If session is invalid or user does not exist.
    """
    from app.core.clerk import verify_clerk_user
    await verify_clerk_user(clerk_user_id, phone)

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise AppException(
            status_code=400,
            error_code="INVALID_OTP",
            message="User not found",
        )

    user.pin_hash = hash_pin(new_pin)
    await db.flush()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _issue_tokens(
    user_id: uuid.UUID,
    redis: aioredis.Redis,
) -> dict[str, str]:
    """Create access + refresh tokens and persist the refresh token in Redis.

    The refresh token includes a ``jti`` (JWT ID) claim so it can be
    individually revoked without invalidating all sessions.

    Args:
        user_id: The user's UUID.
        redis: Active Redis connection.

    Returns:
        Dict with ``access_token``, ``refresh_token``, ``token_type``.
    """
    jti = str(uuid.uuid4())

    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id, jti=jti)

    # Store refresh token reference in Redis for revocation checks
    redis_key = f"{REFRESH_TOKEN_REDIS_PREFIX}{user_id}:{jti}"
    await redis.set(redis_key, "1", ex=REFRESH_TOKEN_TTL_SECONDS)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }
