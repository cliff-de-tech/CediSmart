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


async def test_verify_kyc_duplicate_card(client: AsyncClient, make_user, db_session) -> None:
    # 1. Create a user who already has this card verified
    user_a = await make_user(phone="+233201111111")
    
    # Manually update their ghana_card and save to DB
    user_a.ghana_card = "GHA-123456789-0"
    user_a.kyc_verified = True
    await db_session.flush()

    # 2. Create another user trying to link the same card
    user_b = await make_user(phone="+233202222222")
    headers = make_auth_headers(user_b.id)

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
    assert body["error"]["code"] == "GHANA_CARD_ALREADY_LINKED"
    assert "already verified on another account" in body["error"]["message"]


async def test_delete_me_with_related_data(client: AsyncClient, make_user) -> None:
    # 1. Setup: create user, account, category
    user = await make_user(phone="+233203333333")
    headers = make_auth_headers(user.id)

    account_resp = await client.post(
        "/api/v1/accounts/",
        json={"name": "Cash Wallet", "account_type": "cash", "opening_balance": "1000.00"},
        headers=headers,
    )
    assert account_resp.status_code == 201
    account_id = account_resp.json()["id"]

    cat_resp = await client.post(
        "/api/v1/categories/",
        json={"name": "Transport", "icon": "bus", "color": "#123456", "category_type": "expense"},
        headers=headers,
    )
    assert cat_resp.status_code == 201
    category_id = cat_resp.json()["id"]

    # 2. Setup budget
    budget_resp = await client.post(
        "/api/v1/budgets/",
        json={
            "category_id": category_id,
            "amount": "500.00",
            "budget_year": 2026,
            "budget_month": 6,
        },
        headers=headers,
    )
    assert budget_resp.status_code in [200, 201]

    # 3. Setup transaction
    tx_resp = await client.post(
        "/api/v1/transactions/",
        json={
            "account_id": account_id,
            "category_id": category_id,
            "amount": "150.00",
            "transaction_type": "expense",
            "description": "Trotro fare",
            "transaction_date": "2026-06-21",
        },
        headers=headers,
    )
    assert tx_resp.status_code == 201

    # 4. Perform Delete Account
    delete_resp = await client.delete("/api/v1/users/me", headers=headers)
    assert delete_resp.status_code == 204


async def test_report_bug_logged_locally(client: AsyncClient, make_user) -> None:
    from unittest.mock import patch
    user = await make_user()
    headers = make_auth_headers(user.id)

    with patch("app.core.config.settings.GITHUB_ACCESS_TOKEN", ""):
        resp = await client.post(
            "/api/v1/users/report-bug",
            json={
                "title": "Bug in login screen",
                "description": "It crashes when typing double spaces in phone number field",
                "device_info": {"os": "Android 13", "screen": "1080x2400"}
            },
            headers=headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "logged_locally"
        assert body["issue_number"] is None
        assert body["issue_url"] is None


async def test_report_bug_submitted(client: AsyncClient, make_user) -> None:
    from unittest.mock import patch, MagicMock, AsyncMock
    user = await make_user()
    headers = make_auth_headers(user.id)

    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "number": 42,
        "html_url": "https://github.com/cliff-de-tech/CediSmart/issues/42"
    }

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.core.config.settings.GITHUB_ACCESS_TOKEN", "mock_token"), \
         patch("app.modules.users.service.httpx.AsyncClient") as mock_client_class:

        mock_client_class.return_value.__aenter__.return_value = mock_client

        resp = await client.post(
            "/api/v1/users/report-bug",
            json={
                "title": "Database connection error",
                "description": "The application fails to connect to database periodically",
                "device_info": {"os": "iOS 17", "screen": "1170x2532"}
            },
            headers=headers
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "submitted"
        assert body["issue_number"] == 42
        assert body["issue_url"] == "https://github.com/cliff-de-tech/CediSmart/issues/42"

        assert mock_client.post.call_count == 2
        
        # Verify first call was for GitHub
        github_call = mock_client.post.call_args_list[0]
        args, kwargs = github_call
        assert "https://api.github.com/repos" in args[0]
        assert "mock_token" in kwargs["headers"]["Authorization"]
        assert kwargs["json"]["title"] == "Database connection error"

        # Verify second call was for Discord
        discord_call = mock_client.post.call_args_list[1]
        args, kwargs = discord_call
        assert "discord.com/api/webhooks" in args[0]
        assert "embeds" in kwargs["json"]


async def test_register_device_token(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    # 1. Register a new token
    resp = await client.post(
        "/api/v1/users/me/device-tokens",
        json={
            "token": "ExponentPushToken[12345]",
            "device_name": "iPhone XR",
            "platform": "ios",
        },
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # 2. Register again (update/idempotent check)
    resp = await client.post(
        "/api/v1/users/me/device-tokens",
        json={
            "token": "ExponentPushToken[12345]",
            "device_name": "iPhone XR Updated",
            "platform": "ios",
        },
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


async def test_remove_device_token(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    # Register first
    await client.post(
        "/api/v1/users/me/device-tokens",
        json={
            "token": "ExponentPushToken[67890]",
            "device_name": "Pixel 7",
            "platform": "android",
        },
        headers=headers
    )

    # Remove
    resp = await client.request(
        "DELETE",
        "/api/v1/users/me/device-tokens",
        json={
            "token": "ExponentPushToken[67890]"
        },
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"






