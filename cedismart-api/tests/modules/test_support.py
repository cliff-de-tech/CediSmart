from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_support_chat_mock(client: AsyncClient) -> None:
    # Mock SupportService.generate_chat_response to avoid actual Gemini API calls
    with patch("app.modules.support.router.SupportService.generate_chat_response", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = "Hello! I am the CediSmart Support Assistant. How can I help you today?"

        resp = await client.post(
            "/api/v1/support/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Hello"}
                ]
            }
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["response"] == "Hello! I am the CediSmart Support Assistant. How can I help you today?"
        mock_chat.assert_called_once()

@pytest.mark.asyncio
async def test_support_escalate_mock(client: AsyncClient) -> None:
    # Mock SupportService.escalate_ticket to avoid actual db / GitHub / Discord calls in tests
    with patch("app.modules.support.router.SupportService.escalate_ticket", new_callable=AsyncMock) as mock_escalate:
        mock_escalate.return_value = {
            "ticket_id": "test-ticket-uuid-123",
            "issue_number": 123,
            "issue_url": "https://github.com/cliff-de-tech/CediSmart/issues/123"
        }

        resp = await client.post(
            "/api/v1/support/escalate",
            json={
                "phone": "+233201234567",
                "user_query": "The app keeps crashing when loading the report page",
                "chat_history": [
                    {"role": "user", "content": "The app keeps crashing"},
                    {"role": "model", "content": "I am sorry to hear that. I've noted down the crash."}
                ],
                "device_diagnostics": {
                    "os": "ios",
                    "os_version": "17.2",
                    "app_version": "1.0.0"
                }
            }
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["ticket_id"] == "test-ticket-uuid-123"
        assert body["issue_number"] == 123
        assert body["issue_url"] == "https://github.com/cliff-de-tech/CediSmart/issues/123"
        assert "successfully created" in body["message"]
        mock_escalate.assert_called_once()


from tests.conftest import make_auth_headers

@pytest.mark.asyncio
async def test_support_feedback(client: AsyncClient, make_user) -> None:
    user = await make_user(phone="+233241234567")
    headers = make_auth_headers(user.id)
    
    with patch("app.modules.support.router.SupportService.submit_user_feedback", new_callable=AsyncMock) as mock_feedback:
        resp = await client.post(
            "/api/v1/support/feedback",
            json={
                "feedback_type": "feature_request",
                "description": "Please add dark mode support to the main ledger screen.",
                "device_info": {
                    "os": "android",
                    "app_version": "1.0.0"
                }
            },
            headers=headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "submitted"
        assert "thank you" in body["message"].lower()
        mock_feedback.assert_called_once_with(
            user_phone="+233241234567",
            user_name="Test User",
            feedback_type="feature_request",
            description="Please add dark mode support to the main ledger screen.",
            device_info={"os": "android", "app_version": "1.0.0"}
        )
