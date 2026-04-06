"""Accounts module integration tests."""

from httpx import AsyncClient

from tests.conftest import assert_error_response, make_auth_headers

_ACCOUNT_PAYLOAD = {
    "name": "MTN MoMo",
    "account_type": "mobile_money",
    "provider": "MTN",
    "opening_balance": "500.00",
}


async def _create_account(client: AsyncClient, headers: dict, payload: dict | None = None) -> dict:
    resp = await client.post(
        "/api/v1/accounts/",
        json=payload or _ACCOUNT_PAYLOAD,
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


async def test_create_account(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.post("/api/v1/accounts/", json=_ACCOUNT_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "MTN MoMo"
    assert body["account_type"] == "mobile_money"
    assert "balance" in body


async def test_create_account_invalid_type(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.post(
        "/api/v1/accounts/",
        json={**_ACCOUNT_PAYLOAD, "account_type": "crypto"},
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


async def test_list_accounts(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    await _create_account(client, headers)

    resp = await client.get("/api/v1/accounts/", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# GET /{id}
# ---------------------------------------------------------------------------


async def test_get_account(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    account = await _create_account(client, headers)

    resp = await client.get(f"/api/v1/accounts/{account['id']}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == account["id"]


async def test_get_account_not_found(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    import uuid

    resp = await client.get(f"/api/v1/accounts/{uuid.uuid4()}", headers=headers)
    assert_error_response(resp, 404, "ACCOUNT_NOT_FOUND")


async def test_get_account_wrong_owner(client: AsyncClient, make_user) -> None:
    user_a = await make_user(phone="+233201111111")
    user_b = await make_user(phone="+233202222222")
    account = await _create_account(client, make_auth_headers(user_a.id))

    resp = await client.get(
        f"/api/v1/accounts/{account['id']}",
        headers=make_auth_headers(user_b.id),
    )
    assert_error_response(resp, 404, "ACCOUNT_NOT_FOUND")


# ---------------------------------------------------------------------------
# PATCH /{id}
# ---------------------------------------------------------------------------


async def test_update_account(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    account = await _create_account(client, headers)

    resp = await client.patch(
        f"/api/v1/accounts/{account['id']}",
        json={"name": "Vodafone Cash"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Vodafone Cash"


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


async def test_delete_account_no_transactions(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    account = await _create_account(client, headers)

    resp = await client.delete(f"/api/v1/accounts/{account['id']}", headers=headers)
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Free tier limit
# ---------------------------------------------------------------------------


async def test_free_tier_account_limit(client: AsyncClient, make_user) -> None:
    user = await make_user(is_premium=False)
    headers = make_auth_headers(user.id)

    for i in range(3):
        await _create_account(client, headers, {**_ACCOUNT_PAYLOAD, "name": f"Account {i}"})

    resp = await client.post(
        "/api/v1/accounts/",
        json={**_ACCOUNT_PAYLOAD, "name": "Account 4"},
        headers=headers,
    )
    assert_error_response(resp, 403, "ACCOUNT_LIMIT_REACHED")
