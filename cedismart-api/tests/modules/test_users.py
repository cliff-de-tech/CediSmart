"""Users module integration tests — GET/PATCH/DELETE /api/v1/users/me."""

from httpx import AsyncClient

from tests.conftest import make_auth_headers


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


async def test_update_me_premium(client: AsyncClient, make_user) -> None:
    user = await make_user(is_premium=False)
    headers = make_auth_headers(user.id)

    resp = await client.patch(
        "/api/v1/users/me",
        json={"is_premium": True},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_premium"] is True


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


async def test_verify_kyc_success(client: AsyncClient, make_user) -> None:
    from unittest.mock import patch, MagicMock, AsyncMock
    user = await make_user()
    headers = make_auth_headers(user.id)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "ResultCode": "1012",
        "ResultText": "ID Validated",
        "Actions": {
            "Verify_DOB": "Passed",
            "Verify_Name": "Passed"
        }
    }

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.core.config.settings.SMILE_ID_PARTNER_ID", "123"), \
         patch("app.core.config.settings.SMILE_ID_API_KEY", "api_key"), \
         patch("app.modules.users.service.httpx.AsyncClient") as mock_client_class:

        mock_client_class.return_value.__aenter__.return_value = mock_client

        resp = await client.post(
            "/api/v1/users/verify-kyc",
            json={
                "ghana_card_number": "GHA-123456789-0",
                "full_name": "Kofi Adu",
                "dob": "1990-01-01"
            },
            headers=headers
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["kyc_verified"] is True
        assert body["ghana_card"] == "GHA-123456789-0"

        mock_client.post.assert_called_once()
        args, kwargs = mock_client.post.call_args
        assert "/id_verification" in args[0]
        assert kwargs["json"]["country"] == "GH"
        assert kwargs["json"]["id_type"] == "GHANA_CARD"
        assert kwargs["json"]["id_number"] == "GHA-123456789-0"


async def test_verify_kyc_failure_mismatch(client: AsyncClient, make_user) -> None:
    from unittest.mock import patch, MagicMock, AsyncMock
    user = await make_user()
    headers = make_auth_headers(user.id)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "ResultCode": "1012",
        "ResultText": "ID Validated",
        "Actions": {
            "Verify_DOB": "Passed",
            "Verify_Name": "Failed"
        }
    }

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.core.config.settings.SMILE_ID_PARTNER_ID", "123"), \
         patch("app.core.config.settings.SMILE_ID_API_KEY", "api_key"), \
         patch("app.modules.users.service.httpx.AsyncClient") as mock_client_class:

        mock_client_class.return_value.__aenter__.return_value = mock_client

        resp = await client.post(
            "/api/v1/users/verify-kyc",
            json={
                "ghana_card_number": "GHA-123456789-0",
                "full_name": "Wrong Name",
                "dob": "1990-01-01"
            },
            headers=headers
        )

        assert resp.status_code == 400
        body = resp.json()
        assert body["error"]["code"] == "KYC_DETAILS_MISMATCH"


async def test_verify_kyc_unconfigured(client: AsyncClient, make_user) -> None:
    from unittest.mock import patch
    user = await make_user()
    headers = make_auth_headers(user.id)

    with patch("app.core.config.settings.SMILE_ID_PARTNER_ID", ""), \
         patch("app.core.config.settings.SMILE_ID_API_KEY", ""):

        resp = await client.post(
            "/api/v1/users/verify-kyc",
            json={
                "ghana_card_number": "GHA-123456789-0",
                "full_name": "Kofi Adu",
                "dob": "1990-01-01"
            },
            headers=headers
        )

        assert resp.status_code == 400
        body = resp.json()
        assert body["error"]["code"] == "KYC_CONFIG_ERROR"
