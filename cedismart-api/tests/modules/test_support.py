from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import make_auth_headers


@pytest.mark.asyncio
async def test_support_chat_mock(client: AsyncClient) -> None:
    # Mock SupportService.generate_chat_response to avoid actual Gemini API calls
    with patch(
        "app.modules.support.router.SupportService.generate_chat_response", new_callable=AsyncMock
    ) as mock_chat:
        mock_chat.return_value = (
            "Hello! I am the CediSmart Support Assistant. How can I help you today?"
        )

        resp = await client.post(
            "/api/v1/support/chat", json={"messages": [{"role": "user", "content": "Hello"}]}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert (
            body["response"]
            == "Hello! I am the CediSmart Support Assistant. How can I help you today?"
        )
        mock_chat.assert_called_once()


@pytest.mark.asyncio
async def test_support_escalate_mock(client: AsyncClient) -> None:
    # Mock SupportService.escalate_ticket to avoid actual db / GitHub / Discord calls in tests
    with patch(
        "app.modules.support.router.SupportService.escalate_ticket", new_callable=AsyncMock
    ) as mock_escalate:
        mock_escalate.return_value = {
            "ticket_id": "test-ticket-uuid-123",
            "issue_number": 123,
            "issue_url": "https://github.com/cliff-de-tech/CediSmart/issues/123",
        }

        resp = await client.post(
            "/api/v1/support/escalate",
            json={
                "phone": "+233201234567",
                "user_query": "The app keeps crashing when loading the report page",
                "chat_history": [
                    {"role": "user", "content": "The app keeps crashing"},
                    {
                        "role": "model",
                        "content": "I am sorry to hear that. I've noted down the crash.",
                    },
                ],
                "device_diagnostics": {"os": "ios", "os_version": "17.2", "app_version": "1.0.0"},
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["ticket_id"] == "test-ticket-uuid-123"
        assert body["issue_number"] == 123
        assert body["issue_url"] == "https://github.com/cliff-de-tech/CediSmart/issues/123"
        assert "successfully created" in body["message"]
        mock_escalate.assert_called_once()


@pytest.mark.asyncio
async def test_support_feedback(client: AsyncClient, make_user) -> None:
    user = await make_user(phone="+233241234567")
    headers = make_auth_headers(user.id)

    with patch(
        "app.modules.support.router.SupportService.submit_user_feedback", new_callable=AsyncMock
    ) as mock_feedback:
        resp = await client.post(
            "/api/v1/support/feedback",
            json={
                "feedback_type": "feature_request",
                "description": "Please add dark mode support to the main ledger screen.",
                "device_info": {"os": "android", "app_version": "1.0.0"},
            },
            headers=headers,
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
            device_info={"os": "android", "app_version": "1.0.0"},
        )


@pytest.mark.asyncio
async def test_support_ticket_status_mock(client: AsyncClient) -> None:
    with patch(
        "app.modules.support.router.SupportService.get_ticket_status", new_callable=AsyncMock
    ) as mock_status:
        mock_status.return_value = {
            "issue_number": 42,
            "state": "open",
            "title": "Support Ticket: Phone +233241234567",
            "issue_url": "https://github.com/cliff-de-tech/CediSmart/issues/42",
            "labels": ["support", "escalated", "ai-autofix"],
            "pr_url": "https://github.com/cliff-de-tech/CediSmart/pull/43",
            "pr_state": "open",
            "latest_agent_comment": "ChatGPT (gpt-4o) Code Agent opened PR #43.",
        }

        resp = await client.get("/api/v1/support/ticket-status/42")
        assert resp.status_code == 200
        body = resp.json()
        assert body["issue_number"] == 42
        assert body["pr_url"] == "https://github.com/cliff-de-tech/CediSmart/pull/43"
        assert "ai-autofix" in body["labels"]
        mock_status.assert_called_once_with(issue_number=42)


def test_looks_like_momo_sms() -> None:
    from app.modules.support.service import SupportService

    sample_sms = (
        "Payment received for GHS 150.00 from KWAME MENSAH. "
        "Current Balance: GHS 1,240.50. Financial Transaction ID: 29481920192."
    )
    assert SupportService._looks_like_momo_sms(sample_sms) is True
    assert SupportService._looks_like_momo_sms("Hello how do I create a budget?") is False


def test_extract_display_name_honorifics() -> None:
    from collections import namedtuple

    from app.modules.support.service import SupportService

    MockUser = namedtuple("MockUser", ["full_name"])

    # Strips title "Mr."
    first, full = SupportService._extract_display_name("Mr. Kwame Mensah", None)
    assert first == "Kwame"
    assert full == "Kwame Mensah"

    # Strips title "Dr."
    first, full = SupportService._extract_display_name("Dr. Abena Poku", None)
    assert first == "Abena"
    assert full == "Abena Poku"

    # Strips title "Mrs."
    first, full = SupportService._extract_display_name("Mrs. Jane Doe", None)
    assert first == "Jane"
    assert full == "Jane Doe"

    # Handles bare title "Mr." by falling back to db_user
    db_user = MockUser(full_name="Cliff De Tech")
    first, full = SupportService._extract_display_name("Mr.", db_user)
    assert first == "Cliff"
    assert full == "Cliff De Tech"


@pytest.mark.asyncio
async def test_ticket_status_user_facing_stages(client: AsyncClient) -> None:
    with patch(
        "app.modules.support.router.SupportService.get_ticket_status", new_callable=AsyncMock
    ) as mock_status:
        mock_status.return_value = {
            "issue_number": 42,
            "state": "open",
            "title": "Support Ticket: Phone +233241234567",
            "issue_url": "https://github.com/cliff-de-tech/CediSmart/issues/42",
            "labels": ["support", "escalated"],
            "pr_url": "https://github.com/cliff-de-tech/CediSmart/pull/43",
            "pr_state": "merged",
            "latest_agent_comment": "Fix has been merged.",
            "user_status": "update_available",
            "status_label": "Update Available",
            "status_description": "A verified fix has been merged into CediSmart and will be included in the next app update.",
            "stage_step": 4,
        }

        resp = await client.get("/api/v1/support/ticket-status/42")
        assert resp.status_code == 200
        body = resp.json()
        assert body["user_status"] == "update_available"
        assert body["status_label"] == "Update Available"
        assert body["stage_step"] == 4


@pytest.mark.asyncio
async def test_multi_sms_rescue_parsing() -> None:
    from app.modules.support.service import SupportService

    sms_text = (
        "Payment made for GHS 20.00 to BENYGLAD VENTURES 1. Current Balance: GHS 27.86. Available Balance: GHS 27.86. Reference: . Transaction ID: 34336043447. E-Levy: GHS 0.00.\n"
        "==============================\n"
        "Payment made for GHS 30.00 to SD SAMATECH ENTERPRISE. Current Balance: GHS 57.86. Available Balance: GHS 57.86. Reference: . Transaction ID: 34335805561. E-Levy: GHS 0.00."
    )
    banner = await SupportService._try_instant_sms_rescue(db=None, user_obj=None, raw_text=sms_text)
    assert banner is not None
    assert "2 transactions" in banner
    assert "GH₵ 20.00" in banner
    assert "GH₵ 30.00" in banner
    assert "BENYGLAD VENTURES 1" in banner
    assert "SD SAMATECH ENTERPRISE" in banner


@pytest.mark.asyncio
async def test_support_voice_mock(client: AsyncClient) -> None:
    with patch(
        "app.modules.support.router.SupportService.process_voice", new_callable=AsyncMock
    ) as mock_voice:
        mock_voice.return_value = {
            "transcript": "log 50 cedis for lunch on momo",
            "response": "Done Clifford! Recorded 50 cedis for lunch from your Mobile Money wallet.",
            "action": {
                "type": "create_transaction",
                "payload": {
                    "amount": 50.0,
                    "type": "expense",
                    "category": "Food",
                    "description": "lunch",
                    "account_type": "mobile_money",
                    "screen": None,
                },
            },
        }

        resp = await client.post(
            "/api/v1/support/voice",
            json={
                "audio_base64": "UklGRi4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
                "audio_mime_type": "audio/m4a",
                "user_name": "Mr. Clifford",
                "phone": "+233241234567",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["transcript"] == "log 50 cedis for lunch on momo"
        assert "Recorded 50 cedis" in body["response"]
        assert body["action"]["type"] == "create_transaction"
        assert body["action"]["payload"]["amount"] == 50.0
        mock_voice.assert_called_once()


@pytest.mark.asyncio
async def test_support_voice_synthesize_mock(client: AsyncClient) -> None:
    with patch(
        "app.modules.support.router.SupportService.synthesize_neural_voice", new_callable=AsyncMock
    ) as mock_synth:
        mock_synth.return_value = ("dGVzdC1hdWRpby1ieXRlcw==", "audio/wav")

        resp = await client.post(
            "/api/v1/support/voice/synthesize",
            json={
                "text": "Hi Clifford, I'm listening.",
                "voice_name": "Kore",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["audio_base64"] == "dGVzdC1hdWRpby1ieXRlcw=="
        assert body["audio_mime_type"] == "audio/wav"
        mock_synth.assert_called_once_with(text="Hi Clifford, I'm listening.", voice_name="Kore")


@pytest.mark.asyncio
async def test_voice_recognition_failure_is_explicit(client: AsyncClient) -> None:
    with patch(
        "app.modules.support.router.SupportService.process_voice", new_callable=AsyncMock
    ) as mock_voice:
        mock_voice.return_value = {
            "transcript": "",
            "response": "Please retry.",
            "action": None,
            "error_code": "recognition_unavailable",
        }
        resp = await client.post(
            "/api/v1/support/voice", json={"audio_base64": "test", "synthesize_audio": False}
        )
        assert resp.status_code == 200
        assert resp.json()["error_code"] == "recognition_unavailable"
        assert resp.json()["action"] is None
        assert mock_voice.call_args.kwargs["synthesize_audio"] is False


@pytest.mark.asyncio
async def test_voice_synthesis_failure_returns_503(client: AsyncClient) -> None:
    with patch(
        "app.modules.support.router.SupportService.synthesize_neural_voice", new_callable=AsyncMock
    ) as mock_synth:
        mock_synth.return_value = (None, None)
        resp = await client.post("/api/v1/support/voice/synthesize", json={"text": "Hello"})
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "synthesis_unavailable"


@pytest.mark.asyncio
async def test_missing_voice_provider_does_not_claim_to_hear_user() -> None:
    from app.modules.support.service import SupportService

    with (
        patch("app.modules.support.service.settings.GEMINI_API_KEY", ""),
        patch.object(SupportService, "synthesize_neural_voice", new_callable=AsyncMock) as synth,
    ):
        result = await SupportService.process_voice("test")
    assert result["error_code"] == "recognition_unavailable"
    assert result["transcript"] == ""
    assert result["action"] is None
    synth.assert_not_called()


@pytest.mark.asyncio
async def test_voice_synthesis_falls_back_to_mistral() -> None:
    from app.modules.support.service import SupportService

    with (
        patch("app.modules.support.service.settings.GEMINI_API_KEY", "dummy"),
        patch("app.modules.support.service.settings.MISTRAL_API_KEY", "dummy_mistral"),
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        resp_gemini = AsyncMock(status_code=503)
        resp_mistral = AsyncMock(status_code=200)
        resp_mistral.json = lambda: {"audio_data": "bXAzX2Jhc2U2NA=="}
        mock_post.side_effect = [resp_gemini, resp_gemini, resp_mistral]

        audio_b64, mime = await SupportService.synthesize_neural_voice("Test fallback")
        assert audio_b64 == "bXAzX2Jhc2U2NA=="
        assert mime == "audio/mp3"


@pytest.mark.asyncio
async def test_voice_synthesis_falls_back_to_openai() -> None:
    from app.modules.support.service import SupportService

    with (
        patch("app.modules.support.service.settings.GEMINI_API_KEY", "dummy"),
        patch("app.modules.support.service.settings.MISTRAL_API_KEY", ""),
        patch("app.modules.support.service.settings.OPENAI_API_KEY", "dummy_openai"),
        patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
    ):
        resp_gemini = AsyncMock(status_code=503)
        resp_openai = AsyncMock(status_code=200, content=b"fake_mp3_data")
        mock_post.side_effect = [resp_gemini, resp_gemini, resp_openai]

        audio_b64, mime = await SupportService.synthesize_neural_voice("Test fallback")
        import base64

        assert audio_b64 == base64.b64encode(b"fake_mp3_data").decode("utf-8")
        assert mime == "audio/mp3"
