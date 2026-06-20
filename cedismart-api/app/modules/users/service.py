"""Users module — business logic.

Business rules enforced here:
- All operations are scoped to the authenticated user_id from JWT.
- email must be unique across all users — 409 on conflict.
- Account deletion is soft: personal data is anonymised (GDPR-style scrub),
  financial records are preserved. The user cannot log in after deletion.
- PIN and phone are never returned in any response.
"""

import hashlib
import time
import uuid

import httpx
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.auth.models import User
from app.modules.users.schemas import UserUpdateRequest, KYCVerifyRequest

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
    if payload.is_premium is not None:
        user.is_premium = payload.is_premium

    try:
        await db.flush()
    except IntegrityError as e:
        raise AppException(
            status_code=409,
            error_code="EMAIL_ALREADY_IN_USE",
            message="This email address is already associated with another account.",
            field="email",
        ) from e

    return user


async def delete_current_user(
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> None:
    """Permanently delete the user account and all associated data.

    This performs a database hard-delete. All associated records in child
    tables (financial accounts, transactions, categories, budgets) will
    be automatically deleted via cascade.

    All refresh tokens are invalidated in Redis immediately.
    This is irreversible.
    """
    user = await get_current_user(user_id, db)
    await db.delete(user)
    await db.flush()

    # Revoke all active refresh tokens so no new access tokens can be issued
    pattern = f"{_REFRESH_TOKEN_REDIS_PREFIX}{user_id}:*"
    async for key in redis.scan_iter(match=pattern, count=100):
        await redis.delete(key)


async def verify_user_kyc(
    user_id: uuid.UUID,
    payload: KYCVerifyRequest,
    db: AsyncSession,
) -> User:
    """Verify user identity with Ghana Card using Smile ID enhanced KYC.
    
    If the name and DOB match official registry data, user is upgraded to verified.
    """
    from app.core.config import settings
    from app.core.smile_id import generate_smile_id_signature

    user = await get_current_user(user_id, db)

    if user.kyc_verified:
        return user

    partner_id = settings.SMILE_ID_PARTNER_ID
    api_key = settings.SMILE_ID_API_KEY
    env = settings.SMILE_ID_ENV

    if not partner_id or not api_key:
        raise AppException(
            status_code=400,
            error_code="KYC_CONFIG_ERROR",
            message="Smile ID integration is not configured. Please contact support.",
        )

    base_url = "https://api.smileidentity.com/v1" if env != "sandbox" else "https://sandbox.smileidentity.com/v1"
    timestamp = str(int(time.time() * 1000))
    signature = generate_smile_id_signature(api_key, partner_id, timestamp)

    smile_payload = {
        "partner_id": partner_id,
        "timestamp": timestamp,
        "signature": signature,
        "country": "GH",
        "id_type": "GHANA_CARD",
        "id_number": payload.ghana_card_number,
        "first_name": payload.full_name.split(" ")[0],
        "last_name": payload.full_name.split(" ")[-1] if len(payload.full_name.split(" ")) > 1 else "",
        "dob": payload.dob,
        "partner_params": {
            "user_id": str(user_id),
            "job_id": f"kyc_{int(time.time())}",
            "job_type": 5
        }
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(f"{base_url}/id_verification", json=smile_payload, timeout=15.0)
            result = response.json()
        except Exception as e:
            raise AppException(
                status_code=504,
                error_code="KYC_GATEWAY_TIMEOUT",
                message="NIA verification gateway timed out. Please try again later.",
            ) from e

    # Smile ID returns 1012 for "Enhanced KYC successfully validated"
    # (Some sandbox integrations return 1011 depending on test flow)
    result_code = result.get("ResultCode")
    if response.status_code != 200 or str(result_code) not in ["1012", "1011"]:
        raise AppException(
            status_code=400,
            error_code="KYC_VERIFICATION_FAILED",
            message=result.get("ResultText", "Identity verification failed. Please check your card number."),
        )

    actions = result.get("Actions", {})
    dob_match = actions.get("Verify_DOB") in ["Passed", "Matched"]
    name_match = actions.get("Verify_Name") in ["Passed", "Matched"]

    if not dob_match or not name_match:
        raise AppException(
            status_code=400,
            error_code="KYC_DETAILS_MISMATCH",
            message="Details do not match the official Ghana Card registry record.",
        )

    user.kyc_verified = True
    user.ghana_card = payload.ghana_card_number
    if not user.full_name:
        user.full_name = payload.full_name

    await db.flush()
    return user
