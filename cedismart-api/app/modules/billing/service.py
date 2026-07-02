import hmac
import hashlib
import logging
import uuid
import httpx
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.exceptions import AppException
from app.modules.auth.models import User

logger = logging.getLogger(__name__)

class BillingService:
    @staticmethod
    async def initialize_payment(user_id: uuid.UUID, email: str, plan: str, db: AsyncSession) -> dict[str, Any]:
        """Initialize transaction with Paystack and return checkout details."""
        # Get amount based on plan
        if plan == "pro":
            amount_ghs = 15.00
        elif plan == "business":
            amount_ghs = 49.00
        else:
            raise AppException(
                status_code=400,
                error_code="INVALID_PLAN",
                message="Invalid plan selection. Choose 'pro' or 'business'."
            )

        reference = f"cedi_{uuid.uuid4().hex}"
        amount_kobo = int(amount_ghs * 100) # Paystack expects amounts in lowest currency unit (pesewas/kobo)

        # In development/test mode, if key is missing or dummy, we bypass external HTTP calls
        if not settings.PAYSTACK_SECRET_KEY or settings.PAYSTACK_SECRET_KEY == "dummy" or "test" not in settings.PAYSTACK_SECRET_KEY:
            logger.info("Using mock payment initialization for CediSmart billing.")
            mock_url = f"https://cedismart-api.onrender.com/api/v1/billing/mock-checkout?reference={reference}&user_id={user_id}&plan={plan}"
            # In local dev:
            if settings.ENVIRONMENT == "development":
                mock_url = f"http://192.168.1.199:8000/api/v1/billing/mock-checkout?reference={reference}&user_id={user_id}&plan={plan}"
            return {
                "authorization_url": mock_url,
                "reference": reference
            }

        url = "https://api.paystack.co/transaction/initialize"
        headers = {
            "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "email": email,
            "amount": amount_kobo,
            "currency": "GHS",
            "reference": reference,
            "metadata": {
                "user_id": str(user_id),
                "plan": plan
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    return {
                        "authorization_url": data["data"]["authorization_url"],
                        "reference": reference
                    }
                else:
                    logger.error("Paystack initialize error (status %d): %s", res.status_code, res.text)
                    raise AppException(
                        status_code=502,
                        error_code="PAYMENT_GATEWAY_ERROR",
                        message="Failed to connect with payment provider. Try again later."
                    )
        except Exception as e:
            logger.error("Paystack connection error: %s", str(e))
            raise AppException(
                status_code=503,
                error_code="PAYMENT_GATEWAY_UNREACHABLE",
                message="Payment gateway is currently unreachable. Please try again."
            )

    @staticmethod
    def verify_webhook_signature(signature: str, body: bytes) -> bool:
        """Verify the payload signature sent by Paystack to secure webhook endpoint."""
        if not settings.PAYSTACK_SECRET_KEY:
            # If no secret key is set (e.g. dev mock), signature is always verified
            return True
        computed_sig = hmac.new(
            settings.PAYSTACK_SECRET_KEY.encode('utf-8'),
            body,
            hashlib.sha512
        ).hexdigest()
        return hmac.compare_digest(computed_sig, signature)

    @staticmethod
    async def process_payment_success(user_id_str: str, plan: str, reference: str, db: AsyncSession) -> None:
        """Update user subscription status upon successful payment."""
        try:
            user_uuid = uuid.UUID(user_id_str)
            result = await db.execute(select(User).where(User.id == user_uuid))
            user = result.scalar_one_or_none()
            if user:
                user.is_premium = True
                await db.commit()
                logger.info("Successfully activated Premium for user %s (ref: %s, plan: %s)", user_id_str, reference, plan)
            else:
                logger.warning("User %s not found during payment webhook processing", user_id_str)
        except Exception as e:
            logger.error("Error processing payment success: %s", str(e))
            await db.rollback()
