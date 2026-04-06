"""Termii SMS client — async OTP delivery for CediSmart.

Termii is the Ghana-native SMS gateway used for OTP delivery.
Docs: https://developers.termii.com/messaging

Key design decisions:
- Falls back to a console stub when ``TERMII_API_KEY`` is empty so local
  development works without a Termii account.
- Network errors and non-OK API responses surface as a 503 so callers can
  return a meaningful error without leaking internal details.
- The API key is never logged or included in exception messages.
"""

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import AppException

logger = logging.getLogger(__name__)

_TERMII_SEND_URL = "https://api.ng.termii.com/api/sms/send"
_REQUEST_TIMEOUT = 10.0  # seconds


def _otp_message(otp: str) -> str:
    return (
        f"Your CediSmart verification code is {otp}. "
        "Valid for 5 minutes. Do not share this code with anyone."
    )


async def send_otp(phone: str, otp: str) -> None:
    """Send a 6-digit OTP to ``phone`` via Termii SMS.

    If ``TERMII_API_KEY`` is not configured (empty string), falls back to
    logging the OTP locally. This stub path must never reach production.

    Args:
        phone: E.164-formatted phone number, e.g. ``+233XXXXXXXXX``.
        otp: The 6-digit OTP to deliver.

    Raises:
        AppException 503: If the SMS gateway is unreachable or returns an error.
    """
    if not settings.TERMII_API_KEY:
        # Development stub — TERMII_API_KEY not configured
        logger.warning(
            "SMS_STUB [no TERMII_API_KEY]: would send OTP to %s — code: %s",
            phone,
            otp,
        )
        return

    payload: dict[str, Any] = {
        "to": phone,
        "from": settings.TERMII_SENDER_ID,
        "sms": _otp_message(otp),
        "type": "plain",
        "channel": "generic",
        "api_key": settings.TERMII_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.post(_TERMII_SEND_URL, json=payload)
    except httpx.TimeoutException:
        logger.error("Termii SMS timeout when sending to %s", phone)
        raise AppException(
            status_code=503,
            error_code="SMS_DELIVERY_FAILED",
            message="OTP could not be delivered. Please try again.",
        )
    except httpx.RequestError as exc:
        logger.error("Termii SMS network error for %s: %s", phone, type(exc).__name__)
        raise AppException(
            status_code=503,
            error_code="SMS_DELIVERY_FAILED",
            message="OTP could not be delivered. Please try again.",
        )

    if response.status_code != 200:
        logger.error(
            "Termii SMS non-200 response for %s: status=%d",
            phone,
            response.status_code,
        )
        raise AppException(
            status_code=503,
            error_code="SMS_DELIVERY_FAILED",
            message="OTP could not be delivered. Please try again.",
        )

    body = response.json()
    if body.get("code") != "ok":
        logger.error(
            "Termii SMS delivery rejected for %s: message=%s",
            phone,
            body.get("message", "unknown"),
        )
        raise AppException(
            status_code=503,
            error_code="SMS_DELIVERY_FAILED",
            message="OTP could not be delivered. Please try again.",
        )

    logger.info("OTP delivered via Termii to %s", phone)
