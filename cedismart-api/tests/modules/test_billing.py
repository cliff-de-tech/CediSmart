import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import make_auth_headers
from app.modules.auth.models import User

@pytest.mark.asyncio
async def test_initialize_payment(client: AsyncClient, make_user) -> None:
    user = await make_user(phone="+233241234567", is_premium=False)
    headers = make_auth_headers(user.id)

    resp = await client.post(
        "/api/v1/billing/initialize",
        json={"plan": "pro"},
        headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "authorization_url" in body
    assert "reference" in body
    assert body["reference"].startswith("cedi_")

@pytest.mark.asyncio
async def test_paystack_webhook_success(client: AsyncClient, make_user, db_session: AsyncSession) -> None:
    user = await make_user(phone="+233241112222", is_premium=False)
    assert user.is_premium is False

    payload = {
        "event": "charge.success",
        "data": {
            "reference": "test_ref_123456",
            "metadata": {
                "user_id": str(user.id),
                "plan": "pro"
            }
        }
    }

    # Call Webhook
    resp = await client.post(
        "/api/v1/billing/paystack-webhook",
        json=payload
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "processed"}

    # Verify is_premium is True in DB
    result = await db_session.execute(select(User).where(User.id == user.id))
    user_db = result.scalar_one()
    assert user_db.is_premium is True
