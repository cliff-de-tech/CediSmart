"""Auth module integration tests — Clerk registration, login, tokens, PIN reset."""

from unittest.mock import AsyncMock
import pytest
from httpx import AsyncClient

from tests.conftest import FakeRedis, assert_error_response, make_auth_headers


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register/clerk
# ---------------------------------------------------------------------------


async def test_register_clerk_success(client: AsyncClient, mock_verify_clerk_user) -> None:
    resp = await client.post(
        "/api/v1/auth/register/clerk",
        json={
            "phone": "+233201234567",
            "pin": "123456",
            "full_name": "Kwame Mensah",
            "clerk_user_id": "user_12345",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert body["user"]["phone"] == "+233201234567"
    mock_verify_clerk_user.assert_called_once_with("user_12345", "+233201234567")


async def test_register_clerk_invalid_phone(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/clerk",
        json={
            "phone": "0201234567",  # missing +233
            "pin": "123456",
            "full_name": "Kwame Mensah",
            "clerk_user_id": "user_12345",
        },
    )
    assert resp.status_code == 422


async def test_register_clerk_duplicate_phone(
    client: AsyncClient, make_user, mock_verify_clerk_user
) -> None:
    phone = "+233201234567"
    await make_user(phone=phone)

    resp = await client.post(
        "/api/v1/auth/register/clerk",
        json={
            "phone": phone,
            "pin": "123456",
            "full_name": "Ama",
            "clerk_user_id": "user_12345",
        },
    )
    assert_error_response(resp, 409, "PHONE_ALREADY_REGISTERED")


async def test_register_clerk_all_same_digit_pin(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/clerk",
        json={
            "phone": "+233201234567",
            "pin": "111111",  # unsafe PIN
            "full_name": "Ama",
            "clerk_user_id": "user_12345",
        },
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------


async def test_login_success(client: AsyncClient, make_user) -> None:
    await make_user(phone="+233209876543", pin="123456")

    resp = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233209876543", "pin": "123456"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_login_wrong_pin(client: AsyncClient, make_user) -> None:
    await make_user(phone="+233209876543", pin="123456")

    resp = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233209876543", "pin": "999999"},
    )
    assert_error_response(resp, 401, "INVALID_CREDENTIALS")


async def test_login_inactive_user(client: AsyncClient, make_user) -> None:
    await make_user(phone="+233209876543", pin="123456", is_active=False)

    resp = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233209876543", "pin": "123456"},
    )
    assert_error_response(resp, 401, "INVALID_CREDENTIALS")


async def test_login_unregistered_phone(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233211111111", "pin": "123456"},
    )
    assert_error_response(resp, 401, "INVALID_CREDENTIALS")


# ---------------------------------------------------------------------------
# POST /api/v1/auth/token/refresh
# ---------------------------------------------------------------------------


async def test_token_refresh_success(client: AsyncClient, make_user) -> None:
    await make_user(phone="+233209876543", pin="123456")

    login = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233209876543", "pin": "123456"},
    )
    refresh_token = login.json()["refresh_token"]

    resp = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_token_refresh_invalid_token(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": "this.is.garbage"},
    )
    assert_error_response(resp, 401, "INVALID_REFRESH_TOKEN")


async def test_token_refresh_after_logout(client: AsyncClient, make_user) -> None:
    user = await make_user(phone="+233209876543", pin="123456")
    headers = make_auth_headers(user.id)

    login = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233209876543", "pin": "123456"},
    )
    tokens = login.json()
    refresh_token = tokens["refresh_token"]

    await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": refresh_token},
    )
    assert_error_response(resp, 401, "INVALID_REFRESH_TOKEN")


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------


async def test_logout_success(client: AsyncClient, make_user) -> None:
    user = await make_user(phone="+233209876543", pin="123456")
    headers = make_auth_headers(user.id)

    login = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+233209876543", "pin": "123456"},
    )
    refresh_token = login.json()["refresh_token"]

    resp = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Logged out"


# ---------------------------------------------------------------------------
# POST /api/v1/auth/pin/reset/confirm
# ---------------------------------------------------------------------------


async def test_pin_reset_confirm_success(
    client: AsyncClient, make_user, mock_verify_clerk_user
) -> None:
    phone = "+233201234567"
    await make_user(phone=phone, pin="123456")

    resp = await client.post(
        "/api/v1/auth/pin/reset/confirm",
        json={"phone": phone, "clerk_user_id": "user_mock123", "new_pin": "654321"},
    )
    assert resp.status_code == 200

    # Verify new PIN works for login
    login = await client.post(
        "/api/v1/auth/login",
        json={"phone": phone, "pin": "654321"},
    )
    assert login.status_code == 200
    mock_verify_clerk_user.assert_called_once_with("user_mock123", phone)
