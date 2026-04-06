"""Auth module integration tests — registration, login, tokens, PIN reset."""

import pytest
from httpx import AsyncClient

from tests.conftest import FakeRedis, assert_error_response, make_auth_headers


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register/initiate
# ---------------------------------------------------------------------------


async def test_register_initiate_valid_phone(client: AsyncClient, mock_send_otp) -> None:
    resp = await client.post(
        "/api/v1/auth/register/initiate",
        json={"phone": "+233201234567"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"] == "OTP sent"
    assert body["expires_in"] == 300
    mock_send_otp.assert_called_once()


async def test_register_initiate_invalid_phone(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/initiate",
        json={"phone": "0201234567"},  # missing +233
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register/verify
# ---------------------------------------------------------------------------


async def test_register_verify_success(client: AsyncClient, fake_redis: FakeRedis) -> None:
    phone = "+233201234567"
    await fake_redis.set(f"otp:{phone}", "654321")

    resp = await client.post(
        "/api/v1/auth/register/verify",
        json={
            "phone": phone,
            "otp": "654321",
            "pin": "123456",
            "full_name": "Kwame Mensah",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_register_verify_invalid_otp(client: AsyncClient, fake_redis: FakeRedis) -> None:
    phone = "+233201234567"
    await fake_redis.set(f"otp:{phone}", "654321")

    resp = await client.post(
        "/api/v1/auth/register/verify",
        json={"phone": phone, "otp": "000000", "pin": "123456", "full_name": "Kwame"},
    )
    assert_error_response(resp, 400, "INVALID_OTP")


async def test_register_verify_expired_otp(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/verify",
        json={
            "phone": "+233201234567",
            "otp": "123456",
            "pin": "654321",
            "full_name": "Test",
        },
    )
    assert_error_response(resp, 400, "INVALID_OTP")


async def test_register_verify_duplicate_phone(
    client: AsyncClient, fake_redis: FakeRedis, make_user
) -> None:
    phone = "+233201234567"
    await make_user(phone=phone)
    await fake_redis.set(f"otp:{phone}", "111222")

    resp = await client.post(
        "/api/v1/auth/register/verify",
        json={"phone": phone, "otp": "111222", "pin": "123456", "full_name": "Ama"},
    )
    assert_error_response(resp, 409, "PHONE_ALREADY_REGISTERED")


async def test_register_verify_all_same_digit_pin(
    client: AsyncClient, fake_redis: FakeRedis
) -> None:
    phone = "+233201234567"
    await fake_redis.set(f"otp:{phone}", "111222")

    resp = await client.post(
        "/api/v1/auth/register/verify",
        json={"phone": phone, "otp": "111222", "pin": "111111", "full_name": "Ama"},
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
# POST /api/v1/auth/pin/reset/initiate
# ---------------------------------------------------------------------------


async def test_pin_reset_initiate_registered_phone(
    client: AsyncClient, make_user, mock_send_otp
) -> None:
    await make_user(phone="+233201234567")

    resp = await client.post(
        "/api/v1/auth/pin/reset/initiate",
        json={"phone": "+233201234567"},
    )
    assert resp.status_code == 200
    assert "OTP" in resp.json()["message"]
    mock_send_otp.assert_called_once()


async def test_pin_reset_initiate_unregistered_phone(
    client: AsyncClient, mock_send_otp
) -> None:
    resp = await client.post(
        "/api/v1/auth/pin/reset/initiate",
        json={"phone": "+233211111111"},
    )
    # Response is identical — phone existence is NOT revealed
    assert resp.status_code == 200
    mock_send_otp.assert_not_called()


# ---------------------------------------------------------------------------
# POST /api/v1/auth/pin/reset/confirm
# ---------------------------------------------------------------------------


async def test_pin_reset_confirm_success(
    client: AsyncClient, fake_redis: FakeRedis, make_user
) -> None:
    phone = "+233201234567"
    await make_user(phone=phone, pin="123456")
    await fake_redis.set(f"pin_reset:{phone}", "778899")

    resp = await client.post(
        "/api/v1/auth/pin/reset/confirm",
        json={"phone": phone, "otp": "778899", "new_pin": "654321"},
    )
    assert resp.status_code == 200

    # Verify new PIN works for login
    login = await client.post(
        "/api/v1/auth/login",
        json={"phone": phone, "pin": "654321"},
    )
    assert login.status_code == 200


async def test_pin_reset_confirm_invalid_otp(
    client: AsyncClient, fake_redis: FakeRedis, make_user
) -> None:
    phone = "+233201234567"
    await make_user(phone=phone)
    await fake_redis.set(f"pin_reset:{phone}", "778899")

    resp = await client.post(
        "/api/v1/auth/pin/reset/confirm",
        json={"phone": phone, "otp": "000000", "new_pin": "654321"},
    )
    assert_error_response(resp, 400, "INVALID_OTP")
