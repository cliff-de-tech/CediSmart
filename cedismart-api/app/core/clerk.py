"""Clerk Backend Integration — token and session verification.

Verifies Clerk user IDs against the Clerk Backend API using HTTPX.
"""

import logging
from typing import Any
import httpx

from app.core.config import settings
from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


def _normalize_phone(phone: str) -> str:
    """Normalize phone number to digits only for reliable comparison."""
    return "".join(c for c in phone if c.isdigit())


async def verify_clerk_user(clerk_user_id: str, expected_phone: str) -> dict[str, Any]:
    """Verify that the clerk_user_id exists in Clerk and has a matching verified phone number.

    Args:
        clerk_user_id: The Clerk user ID (e.g. user_...).
        expected_phone: The expected phone number in E.164 format.

    Returns:
        The Clerk user record json.

    Raises:
        AppException 503: If Clerk's API is unreachable.
        AppException 400: If the session is invalid or phone numbers do not match.
    """
    # Allow local development/testing bypass if no key is set
    if not settings.CLERK_SECRET_KEY:
        logger.warning(
            "CLERK_SECRET_KEY is empty. Bypassing verification of user %s with phone %s.",
            clerk_user_id,
            expected_phone,
        )
        return {"id": clerk_user_id, "phone_numbers": [{"phone_number": expected_phone}]}

    url = f"https://api.clerk.com/v1/users/{clerk_user_id}"
    headers = {
        "Authorization": f"Bearer {settings.CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as exc:
        logger.error("Clerk API connection failed: %s", str(exc))
        raise AppException(
            status_code=503,
            error_code="AUTH_PROVIDER_UNREACHABLE",
            message="Verification service is currently unavailable. Please try again.",
        ) from exc

    if response.status_code != 200:
        logger.warning(
            "Clerk verification returned status %d for user_id %s: %s",
            response.status_code,
            clerk_user_id,
            response.text,
        )
        raise AppException(
            status_code=400,
            error_code="INVALID_AUTH_SESSION",
            message="Your authentication session is invalid or has expired.",
        )

    user_data = response.json()

    # Verify matching verified phone number
    phone_records = user_data.get("phone_numbers", [])
    verified_phones = [
        rec.get("phone_number")
        for rec in phone_records
        if rec.get("verification", {}).get("status") == "verified"
    ]

    expected_normalized = _normalize_phone(expected_phone)
    matched = False
    for vp in verified_phones:
        if vp and _normalize_phone(vp) == expected_normalized:
            matched = True
            break

    if not matched:
        logger.warning(
            "Clerk user %s phone numbers %s do not match expected phone %s",
            clerk_user_id,
            verified_phones,
            expected_phone,
        )
        raise AppException(
            status_code=400,
            error_code="PHONE_MISMATCH",
            message="The authenticated phone number does not match your registration phone number.",
        )

    return user_data
