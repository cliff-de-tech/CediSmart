import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.exceptions import AppException
from app.modules.auth.models import User
from app.modules.billing.schemas import PaymentInitializeRequest, PaymentInitializeResponse
from app.modules.billing.service import BillingService
from app.modules.users.schemas import UserResponse

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db)]


async def _get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppException(
            status_code=401, error_code="USER_NOT_FOUND", message="User session not found."
        )
    return user


@router.post(
    "/start-trial",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Start user's 7-day free trial of CediSmart Pro",
)
async def start_trial(user_id: CurrentUser, db: DBSession) -> UserResponse:
    user = await _get_user(user_id, db)
    if user.trial_started_at is not None:
        raise AppException(
            status_code=400,
            error_code="TRIAL_ALREADY_USED",
            message="You have already redeemed or started your free trial.",
        )
    user.trial_started_at = datetime.now(UTC)
    await db.commit()
    return UserResponse.model_validate(user)


@router.post(
    "/cancel",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel active subscription or opt-out of the free trial",
)
async def cancel_subscription(user_id: CurrentUser, db: DBSession) -> UserResponse:
    user = await _get_user(user_id, db)

    # 1. If in active trial, opt-out by setting start date to past
    if user.is_trial_active:
        from datetime import timedelta

        user.trial_started_at = datetime.now(UTC) - timedelta(days=10)

    # 2. If paid premium member, clear premium fields
    if user.is_premium:
        user.is_premium = False
        user.premium_expires_at = None

    await db.commit()
    return UserResponse.model_validate(user)


@router.post(
    "/initialize",
    response_model=PaymentInitializeResponse,
    status_code=status.HTTP_200_OK,
    summary="Initialize Paystack transaction for premium upgrade",
)
async def initialize_payment(
    body: PaymentInitializeRequest, user_id: CurrentUser, db: DBSession
) -> PaymentInitializeResponse:
    user = await _get_user(user_id, db)
    # Generate default email from phone as Paystack requires email field
    email = f"{user.phone.replace('+', '')}@cedismart.com"

    res = await BillingService.initialize_payment(
        user_id=user_id, email=email, plan=body.plan, db=db
    )
    return PaymentInitializeResponse(
        authorization_url=res["authorization_url"], reference=res["reference"]
    )


@router.post(
    "/paystack-webhook",
    status_code=status.HTTP_200_OK,
    summary="Handle Paystack billing webhook events",
)
async def paystack_webhook(
    request: Request, db: DBSession, x_paystack_signature: Annotated[str | None, Header()] = None
) -> dict[str, str]:
    body_bytes = await request.body()

    # Verify webhook signature
    if x_paystack_signature:
        is_valid = BillingService.verify_webhook_signature(x_paystack_signature, body_bytes)
        if not is_valid:
            raise AppException(
                status_code=401,
                error_code="INVALID_WEBHOOK_SIGNATURE",
                message="Signature verification failed.",
            )

    try:
        payload = await request.json()
    except Exception:
        # Fallback if body bytes are form encoded or raw
        payload = {}

    event = payload.get("event")

    if event == "charge.success":
        data = payload.get("data", {})
        reference = data.get("reference")
        metadata = data.get("metadata", {})
        user_id_str = metadata.get("user_id")
        plan = metadata.get("plan")

        if user_id_str and plan:
            await BillingService.process_payment_success(
                user_id_str=user_id_str, plan=plan, reference=reference, db=db
            )

    return {"status": "processed"}


@router.get(
    "/mock-checkout",
    response_class=HTMLResponse,
    summary="Mock checkout web page for local testing",
)
async def mock_checkout(reference: str, user_id: str, plan: str) -> str:
    """Return a styled checkout page for simulated local testing."""
    return (
        "\n    <!DOCTYPE html>\n    <html>\n    <head>\n        <title>CediSmart Simulated "
        'Checkout</title>\n        <meta name="viewport" content="width=device-width, '
        'initial-scale=1.0">\n        <style>\n            body {\n                font-family: '
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, '
        "sans-serif;\n                background-color: #121212;\n                color: "
        "#ffffff;\n                display: flex;\n                flex-direction: column;\n     "
        "           align-items: center;\n                justify-content: center;\n             "
        "   height: 100vh;\n                margin: 0;\n                padding: 20px;\n         "
        "       box-sizing: border-box;\n            }\n            .card {\n                "
        "background-color: #1e1e1e;\n                border: 1px solid #0A6E4A;\n                "
        "border-radius: 16px;\n                padding: 30px;\n                max-width: "
        "400px;\n                width: 100%;\n                text-align: center;\n             "
        "   box-shadow: 0 10px 25px rgba(0,0,0,0.5);\n            }\n            h2 {\n          "
        "      color: #0A6E4A;\n                margin-top: 0;\n            }\n            p {\n "
        "               color: #b0b0b0;\n                font-size: 14px;\n                "
        "line-height: 1.6;\n            }\n            .btn {\n                background-color: "
        "#0A6E4A;\n                color: white;\n                border: none;\n                "
        "padding: 14px 28px;\n                font-size: 16px;\n                font-weight: "
        "bold;\n                border-radius: 12px;\n                cursor: pointer;\n         "
        "       width: 100%;\n                margin-top: 20px;\n                transition: "
        "background-color 0.2s;\n            }\n            .btn:hover {\n                "
        "background-color: #0d8a5c;\n            }\n            .badge {\n                "
        "display: inline-block;\n                background-color: rgba(10, 110, 74, 0.2);\n     "
        "           color: #0A6E4A;\n                padding: 6px 12px;\n                "
        "border-radius: 20px;\n                font-weight: bold;\n                font-size: "
        "12px;\n                margin-bottom: 15px;\n            }\n        </style>\n    "
        '</head>\n    <body>\n        <div class="card">\n            <div '
        'class="badge">'
        f"{plan.upper()}"
        " PLAN</div>\n            <h2>CediSmart Checkout</h2>\n            <p>This is a "
        "simulated Mobile Money payment gateway for testing CediSmart's subscription flow.</p>\n "
        "           <p><strong>Reference:</strong> "
        "<code>"
        f"{reference}"
        '</code></p>\n            <button class="btn" '
        'onclick="submitSimulatedPayment()">Authorize Payment (MoMo)</button>\n        '
        "</div>\n        <script>\n            async function submitSimulatedPayment() {\n       "
        '         const payload = {\n                    event: "charge.success",\n            '
        "        data: {\n                        reference: "
        '"'
        f"{reference}"
        '",\n                        metadata: {\n                            user_id: '
        '"'
        f"{user_id}"
        '",\n                            plan: '
        '"'
        f"{plan}"
        '"\n                        }\n                    }\n                };\n              '
        "  try {\n                    const res = await "
        "fetch('/api/v1/billing/paystack-webhook', {\n                        method: 'POST',\n  "
        "                      headers: {\n                            'Content-Type': "
        "'application/json'\n                        },\n                        body: "
        "JSON.stringify(payload)\n                    });\n                    if (res.ok) {\n   "
        "                     alert('✅ Payment Simulated Successfully! Your premium subscription "
        "is now active. Return to the CediSmart app.');\n                    } else {\n          "
        "              alert('❌ Error: Payment simulation failed.');\n                    }\n    "
        "            } catch (e) {\n                    alert('❌ Error: Could not connect to "
        "API.');\n                }\n            }\n        </script>\n    </body>\n    "
        "</html>\n    "
    )
