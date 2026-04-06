"""Users module — business logic.

Business rules enforced here:
- All operations are scoped to the authenticated user_id from JWT.
- email must be unique across all users — 409 on conflict.
- Account deletion is soft: personal data is anonymised (GDPR-style scrub),
  financial records are preserved. The user cannot log in after deletion.
- PIN and phone are never returned in any response.
"""

import hashlib
import uuid
from typing import Optional

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.auth.models import User
from app.modules.users.schemas import UserUpdateRequest

# Matches the prefix defined in auth/service.py
_REFRESH_TOKEN_REDIS_PREFIX = "refresh:"


async def get_current_user(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> User:
    """Return the authenticated user's profile."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppException(
            status_code=404,
            error_code="USER_NOT_FOUND",
            message="User not found",
        )
    return user


async def update_current_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    db: AsyncSession,
) -> User:
    """Update mutable profile fields (full_name, email, currency).

    phone and pin_hash are immutable via this endpoint.
    email uniqueness is enforced by a DB constraint — surfaces as 409.
    """
    user = await get_current_user(user_id, db)

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.currency is not None:
        user.currency = payload.currency
    if payload.email is not None:
        user.email = payload.email

    try:
        await db.flush()
    except IntegrityError:
        raise AppException(
            status_code=409,
            error_code="EMAIL_ALREADY_IN_USE",
            message="This email address is already associated with another account.",
            field="email",
        )

    return user


async def delete_current_user(
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> None:
    """GDPR-style account deletion.

    Personal identifiers (phone, email, full_name) are replaced with
    anonymised values derived from the user's UUID. The account is
    deactivated so the user cannot log in. Financial records are preserved
    for audit integrity — they are de-identified via the anonymised phone.

    All refresh tokens are invalidated in Redis immediately so no new
    access tokens can be issued. The current access token will expire
    naturally within its 15-minute TTL.

    This is irreversible.
    """
    user = await get_current_user(user_id, db)

    # Derive a stable anonymous identifier from the UUID — not reversible
    anon_id = hashlib.sha256(str(user_id).encode()).hexdigest()[:16]

    user.phone = f"deleted_{anon_id}"
    user.email = None
    user.full_name = None
    user.is_active = False

    await db.flush()

    # Revoke all active refresh tokens so no new access tokens can be issued
    pattern = f"{_REFRESH_TOKEN_REDIS_PREFIX}{user_id}:*"
    async for key in redis.scan_iter(match=pattern, count=100):
        await redis.delete(key)
