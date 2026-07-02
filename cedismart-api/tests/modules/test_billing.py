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

@pytest.mark.asyncio
async def test_start_trial(client: AsyncClient, make_user) -> None:
    user = await make_user(is_premium=False)
    headers = make_auth_headers(user.id)

    # Initialize request
    resp = await client.post("/api/v1/billing/start-trial", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_trial_active"] is True
    assert body["trial_days_remaining"] == 7
    assert body["has_premium_access"] is True

    # Duplicate call
    resp_dup = await client.post("/api/v1/billing/start-trial", headers=headers)
    assert resp_dup.status_code == 400
    assert resp_dup.json()["error"]["code"] == "TRIAL_ALREADY_USED"

@pytest.mark.asyncio
async def test_cancel_trial_and_premium(client: AsyncClient, make_user, db_session) -> None:
    # 1. Test cancel trial
    user = await make_user(is_premium=False)
    headers = make_auth_headers(user.id)
    await client.post("/api/v1/billing/start-trial", headers=headers)

    resp = await client.post("/api/v1/billing/cancel", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_trial_active"] is False
    assert resp.json()["has_premium_access"] is False

    # 2. Test cancel paid premium
    user_paid = await make_user(is_premium=True, phone="+233207777777")
    headers_paid = make_auth_headers(user_paid.id)

    resp_paid = await client.post("/api/v1/billing/cancel", headers=headers_paid)
    assert resp_paid.status_code == 200
    assert resp_paid.json()["is_premium"] is False
    assert resp_paid.json()["has_premium_access"] is False


