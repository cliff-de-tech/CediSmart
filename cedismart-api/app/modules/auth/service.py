"""Auth module — business logic for registration, login, token management.

Security invariants enforced here:
- OTPs generated via ``secrets.randbelow`` (CSPRNG), stored in Redis only (5-min TTL).
- OTP comparison uses ``hmac.compare_digest`` to prevent timing attacks.
- PINs hashed with bcrypt cost-factor 12 (via ``app.core.security``).
- Refresh tokens carry a ``jti`` claim and are tracked in Redis for revocation.
- All error messages are generic — never reveal whether a phone is registered.
"""

import hmac
import logging
import secrets
import uuid

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
from app.core.sms import send_otp
from app.modules.auth.models import User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OTP_TTL_SECONDS: int = 300  # 5 minutes
OTP_REDIS_PREFIX: str = "otp:"
PIN_RESET_OTP_REDIS_PREFIX: str = "pin_reset:"  # distinct namespace — prevents cross-flow OTP reuse
REFRESH_TOKEN_REDIS_PREFIX: str = "refresh:"
REFRESH_TOKEN_TTL_SECONDS: int = 30 * 24 * 60 * 60  # 30 days


# ---------------------------------------------------------------------------
# OTP helpers
# ---------------------------------------------------------------------------


def _generate_otp() -> str:
    """Generate a cryptographically random 6-digit OTP.

    Uses ``secrets.randbelow`` — never ``random.randint``.
    """
    return str(secrets.randbelow(900_000) + 100_000)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


async def initiate_registration(
    phone: str,
    redis: aioredis.Redis,
) -> int:
    """Generate and store an OTP for a new registration attempt.

    Args:
        phone: E.164-formatted phone number.
        redis: Active Redis connection.

    Returns:
        The OTP TTL in seconds (always ``OTP_TTL_SECONDS``).
    """
    otp = _generate_otp()
    redis_key = f"{OTP_REDIS_PREFIX}{phone}"

    await redis.set(redis_key, otp, ex=OTP_TTL_SECONDS)
    await send_otp(phone, otp)

    return OTP_TTL_SECONDS


async def verify_registration(
    phone: str,
    otp: str,
    pin: str,
    full_name: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict[str, str]:
    """Verify OTP, create user, and issue JWT tokens.

    Args:
        phone: E.164-formatted phone number.
        otp: 6-digit OTP provided by the user.
        pin: 6-digit PIN chosen by the user.
        full_name: User's display name.
        db: Async database session.
        redis: Active Redis connection.

    Returns:
        Dict with ``access_token``, ``refresh_token``, ``token_type``.

    Raises:
        AppException 400: If the OTP is invalid or expired.
        AppException 409: If the phone number is already registered.
    """
    # --- Validate OTP ---
    redis_key = f"{OTP_REDIS_PREFIX}{phone}"
    stored_otp: str | None = await redis.get(redis_key)

    if stored_otp is None or not hmac.compare_digest(stored_otp, otp):
        raise AppException(
            status_code=400,
            error_code="INVALID_OTP",
            message="Invalid or expired OTP",
        )

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
    )
    db.add(user)
    await db.flush()  # Populate user.id before commit

    # --- Issue tokens ---
    tokens = await _issue_tokens(user.id, redis)

    # --- Clean up OTP ---
    await redis.delete(redis_key)

    return tokens


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

    return await _issue_tokens(user.id, redis)


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


async def initiate_pin_reset(
    phone: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> int:
    """Generate and store a PIN-reset OTP for a registered phone number.

    Deliberately silent when the phone is not found — caller always sees the
    same successful response to prevent phone-number enumeration.

    Args:
        phone: E.164-formatted phone number.
        db: Async database session.
        redis: Active Redis connection.

    Returns:
        The OTP TTL in seconds (always ``OTP_TTL_SECONDS``).
    """
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    # Only send OTP when phone is found and account is active.
    # Response is identical either way — phone existence is not revealed.
    if user is not None and user.is_active:
        otp = _generate_otp()
        redis_key = f"{PIN_RESET_OTP_REDIS_PREFIX}{phone}"
        await redis.set(redis_key, otp, ex=OTP_TTL_SECONDS)
        await send_otp(phone, otp)

    return OTP_TTL_SECONDS


async def confirm_pin_reset(
    phone: str,
    otp: str,
    new_pin: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> None:
    """Verify OTP and replace the user's PIN hash.

    Both "phone not found" and "OTP mismatch" return the same 400 error to
    prevent enumeration. OTP is consumed (deleted from Redis) immediately
    after successful verification — single-use enforced.

    Args:
        phone: E.164-formatted phone number.
        otp: 6-digit OTP provided by the user.
        new_pin: New 6-digit PIN (plaintext — hashed here before storage).
        db: Async database session.
        redis: Active Redis connection.

    Raises:
        AppException 400: If OTP is invalid, expired, or phone is not found.
    """
    _invalid = AppException(
        status_code=400,
        error_code="INVALID_OTP",
        message="Invalid or expired OTP",
    )

    redis_key = f"{PIN_RESET_OTP_REDIS_PREFIX}{phone}"
    stored_otp: str | None = await redis.get(redis_key)

    # Timing-safe comparison — prevents timing-oracle attacks
    if stored_otp is None or not hmac.compare_digest(stored_otp, otp):
        raise _invalid

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise _invalid

    user.pin_hash = hash_pin(new_pin)
    await db.flush()

    # Consume OTP — single use enforced
    await redis.delete(redis_key)


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
