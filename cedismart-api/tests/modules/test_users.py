"""Users module integration tests — GET/PATCH/DELETE /api/v1/users/me."""

import pytest
from httpx import AsyncClient

from tests.conftest import assert_error_response, make_auth_headers


async def test_get_me(client: AsyncClient, make_user) -> None:
    user = await make_user(phone="+233201234567", full_name="Kofi Adu")
    headers = make_auth_headers(user.id)

    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == "+233201234567"
    assert body["full_name"] == "Kofi Adu"
    assert "pin_hash" not in body


async def test_get_me_unauthenticated(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 403


async def test_update_me_full_name(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.patch(
        "/api/v1/users/me",
        json={"full_name": "Abena Owusu"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Abena Owusu"


async def test_update_me_currency(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.patch(
        "/api/v1/users/me",
        json={"currency": "USD"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["currency"] == "USD"


async def test_update_me_invalid_currency(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.patch(
        "/api/v1/users/me",
        json={"currency": "XYZ"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_delete_me(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.delete("/api/v1/users/me", headers=headers)
    assert resp.status_code == 204

    # Account is deactivated — login should fail
    login = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233201234567", "pin": "123456"},
    )
    assert login.status_code == 401
