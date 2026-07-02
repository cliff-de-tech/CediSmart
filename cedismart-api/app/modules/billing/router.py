import uuid
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

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db)]

async def _get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppException(
            status_code=401,
            error_code="USER_NOT_FOUND",
            message="User session not found."
        )
    return user

@router.post(
    "/initialize",
    response_model=PaymentInitializeResponse,
    status_code=status.HTTP_200_OK,
    summary="Initialize Paystack transaction for premium upgrade"
)
async def initialize_payment(
    body: PaymentInitializeRequest,
    user_id: CurrentUser,
    db: DBSession
) -> PaymentInitializeResponse:
    user = await _get_user(user_id, db)
    # Generate default email from phone as Paystack requires email field
    email = f"{user.phone.replace('+', '')}@cedismart.com"
    
    res = await BillingService.initialize_payment(
        user_id=user_id,
        email=email,
        plan=body.plan,
        db=db
    )
    return PaymentInitializeResponse(
        authorization_url=res["authorization_url"],
        reference=res["reference"]
    )

@router.post(
    "/paystack-webhook",
    status_code=status.HTTP_200_OK,
    summary="Handle Paystack billing webhook events"
)
async def paystack_webhook(
    request: Request,
    db: DBSession,
    x_paystack_signature: Annotated[str | None, Header()] = None
) -> dict[str, str]:
    body_bytes = await request.body()
    
    # Verify webhook signature
    if x_paystack_signature:
        is_valid = BillingService.verify_webhook_signature(x_paystack_signature, body_bytes)
        if not is_valid:
            raise AppException(
                status_code=401,
                error_code="INVALID_WEBHOOK_SIGNATURE",
                message="Signature verification failed."
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
                user_id_str=user_id_str,
                plan=plan,
                reference=reference,
                db=db
            )
            
    return {"status": "processed"}

@router.get(
    "/mock-checkout",
    response_class=HTMLResponse,
    summary="Mock checkout web page for local testing"
)
async def mock_checkout(
    reference: str,
    user_id: str,
    plan: str
) -> str:
    """Return a styled checkout page for simulated local testing."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>CediSmart Simulated Checkout</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #121212;
                color: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
            }}
            .card {{
                background-color: #1e1e1e;
                border: 1px solid #0A6E4A;
                border-radius: 16px;
                padding: 30px;
                max-width: 400px;
                width: 100%;
                text-align: center;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            }}
            h2 {{
                color: #0A6E4A;
                margin-top: 0;
            }}
            p {{
                color: #b0b0b0;
                font-size: 14px;
                line-height: 1.6;
            }}
            .btn {{
                background-color: #0A6E4A;
                color: white;
                border: none;
                padding: 14px 28px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 12px;
                cursor: pointer;
                width: 100%;
                margin-top: 20px;
                transition: background-color 0.2s;
            }}
            .btn:hover {{
                background-color: #0d8a5c;
            }}
            .badge {{
                display: inline-block;
                background-color: rgba(10, 110, 74, 0.2);
                color: #0A6E4A;
                padding: 6px 12px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 12px;
                margin-bottom: 15px;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="badge">{plan.upper()} PLAN</div>
            <h2>CediSmart Checkout</h2>
            <p>This is a simulated Mobile Money payment gateway for testing CediSmart's subscription flow.</p>
            <p><strong>Reference:</strong> <code>{reference}</code></p>
            <button class="btn" onclick="submitSimulatedPayment()">Authorize Payment (MoMo)</button>
        </div>
        <script>
            async function submitSimulatedPayment() {{
                const payload = {{
                    event: "charge.success",
                    data: {{
                        reference: "{reference}",
                        metadata: {{
                            user_id: "{user_id}",
                            plan: "{plan}"
                        }}
                    }}
                }};
                try {{
                    const res = await fetch('/api/v1/billing/paystack-webhook', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json'
                        }},
                        body: JSON.stringify(payload)
                    }});
                    if (res.ok) {{
                        alert('✅ Payment Simulated Successfully! Your premium subscription is now active. Return to the CediSmart app.');
                    }} else {{
                        alert('❌ Error: Payment simulation failed.');
                    }}
                }} catch (e) {{
                    alert('❌ Error: Could not connect to API.');
                }}
            }}
        </script>
    </body>
    </html>
    """
