import pytest
from httpx import AsyncClient
from tests.conftest import make_auth_headers

async def _setup_momo(client: AsyncClient, make_user) -> tuple:
    user = await make_user()
    headers = make_auth_headers(user.id)

    # Create a mobile money account with the target phone number
    account_resp = await client.post(
        "/api/v1/accounts/",
        json={
            "name": "MTN Wallet",
            "account_type": "mobile_money",
            "provider": "MTN MoMo",
            "account_number": "0241234567",
            "opening_balance": "100.00"
        },
        headers=headers,
    )
    assert account_resp.status_code == 201

    return user, account_resp.json()["id"], headers

async def test_sms_webhook_income(client: AsyncClient, make_user) -> None:
    _, account_id, headers = await _setup_momo(client, make_user)

    body = (
        "You have received GHS 50.00 from Kojo Mensah (0241234567). "
        "Your new balance is GHS 150.00. Transaction ID: 194827189."
    )
    resp = await client.post(
        "/api/v1/transactions/sms-webhook",
        json={
            "sender": "MobileMoney",
            "message_body": body,
            "phone": "0241234567"
        },
        headers=headers
    )
    assert resp.status_code == 201
    res = resp.json()
    assert res["amount"] == "50.0"
    assert res["transaction_type"] == "income"
    assert res["account"]["id"] == account_id

    # Verify duplicate prevention (409)
    resp_dup = await client.post(
        "/api/v1/transactions/sms-webhook",
        json={
            "sender": "MobileMoney",
            "message_body": body,
            "phone": "0241234567"
        },
        headers=headers
    )
    assert resp_dup.status_code == 409

async def test_sms_webhook_expense_with_fee(client: AsyncClient, make_user) -> None:
    _, account_id, headers = await _setup_momo(client, make_user)

    body = (
        "You have transferred GHS 20.00 to Kofi Owusu (0244112233). "
        "Fee charged: GHS 0.20. Your new balance is GHS 79.80. "
        "Transaction ID: 194827190."
    )
    resp = await client.post(
        "/api/v1/transactions/sms-webhook",
        json={
            "sender": "MTNMoMo",
            "message_body": body,
            "phone": "0241234567"
        },
        headers=headers
    )
    assert resp.status_code == 201
    res = resp.json()
    assert res["amount"] == "20.0"
    assert res["transaction_type"] == "expense"

    # Verify balance reconciliation:
    # Starting opening balance: 100.00
    # SMS says new balance is: 79.80
    # SMS transaction is: 20.00 + 0.20 fee = 20.20
    # Calculated balance is: 100.00 - 20.20 = 79.80
    # Verification of reconciliation: Let's fetch account balance
    acc_resp = await client.get(f"/api/v1/accounts/{account_id}", headers=headers)
    assert acc_resp.status_code == 200
    assert acc_resp.json()["balance"] == "79.80"

async def test_sms_webhook_not_found(client: AsyncClient, make_user) -> None:
    # Test webhook with a phone number that has no linked account
    user = await make_user()
    headers = make_auth_headers(user.id)

    body = (
        "You have received GHS 50.00 from Kojo Mensah (0241234567). "
        "Your new balance is GHS 150.00. Transaction ID: 194827189."
    )
    resp = await client.post(
        "/api/v1/transactions/sms-webhook",
        json={
            "sender": "MobileMoney",
            "message_body": body,
            "phone": "0249999999"
        },
        headers=headers
    )
    assert resp.status_code == 404
