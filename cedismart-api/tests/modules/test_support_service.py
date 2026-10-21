"""Exercise support integrations with mocked HTTP and the real test database."""

import base64
import io
import json
import wave
from collections.abc import AsyncIterator, Callable
from datetime import date
from decimal import Decimal

import httpx
import pytest
from httpx import AsyncClient, MockTransport, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import close_redis
from app.modules.accounts.models import FinancialAccount
from app.modules.categories.models import Category
from app.modules.support.schemas import ChatMessage
from app.modules.support.service import SupportService
from app.modules.transactions.models import Transaction

MOMO_SMS = (
    "You have received GHS 50.00 from Kojo Mensah (0241234567). "
    "Your new balance is GHS 124.50. Transaction ID: 194827189."
)


@pytest.fixture(autouse=True)
async def isolated_support_settings(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[None]:
    for name in (
        "GEMINI_API_KEY",
        "OPENAI_API_KEY",
        "GITHUB_ACCESS_TOKEN",
        "DISCORD_WEBHOOK_URL",
        "DISCORD_FEEDBACK_WEBHOOK_URL",
    ):
        monkeypatch.setattr(settings, name, None)
    try:
        yield
    finally:
        # SMS rescue can initialize Redis without the HTTP client fixture.
        await close_redis()


def _mock_http(
    monkeypatch: pytest.MonkeyPatch, handler: Callable[[Request], Response]
) -> list[Request]:
    requests: list[Request] = []

    def record(request: Request) -> Response:
        requests.append(request)
        return handler(request)

    monkeypatch.setattr(
        "app.modules.support.service.httpx.AsyncClient",
        lambda **kwargs: AsyncClient(transport=MockTransport(record), **kwargs),
    )
    return requests


@pytest.mark.parametrize(
    ("audio_mime", "provider_mime"), [("audio/m4a", "audio/mp4"), ("audio/ogg", "audio/ogg")]
)
async def test_voice_transcription_preserves_intent_and_synthesizes_reply(
    monkeypatch: pytest.MonkeyPatch, audio_mime: str, provider_mime: str
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    intent = {
        "transcript": "log 50 cedis for lunch on momo",
        "response": "Clifford, ready to add 50 cedis for lunch.",
        "action": {
            "type": "create_transaction",
            "payload": {"amount": 50.0, "type": "expense", "account_type": "mobile_money"},
        },
    }

    def respond(request: Request) -> Response:
        body = json.loads(request.content)
        if body["generationConfig"].get("responseMimeType") == "application/json":
            if "gemini-flash-lite-latest:" in request.url.path:
                return Response(200, json={"candidates": []})
            if "gemini-3.5-flash-lite:" in request.url.path:
                return Response(200, json={"candidates": [{"content": {"parts": []}}]})
            part = {"text": "```json\n" + json.dumps(intent) + "\n```"}
        else:
            part = {"inlineData": {"data": "YXVkaW8=", "mimeType": "audio/wav"}}
        return Response(200, json={"candidates": [{"content": {"parts": [part]}}]})

    requests = _mock_http(monkeypatch, respond)
    result = await SupportService.process_voice(
        "data:audio/m4a;base64, YXVkaW8= ", audio_mime, user_name="Mr. Clifford"
    )
    assert result == {**intent, "audio_base64": "YXVkaW8=", "audio_mime_type": "audio/wav"}
    assert len(requests) == 4
    recognition = json.loads(requests[0].content)
    assert recognition["contents"][0]["parts"][0]["inlineData"] == {
        "mimeType": provider_mime,
        "data": "YXVkaW8=",
    }
    assert "talking directly to Clifford in Ghana" in recognition["contents"][0]["parts"][1]["text"]
    synthesis = json.loads(requests[-1].content)
    assert synthesis["contents"][0]["parts"][0]["text"] == intent["response"]
    assert synthesis["generationConfig"]["responseModalities"] == ["AUDIO"]


@pytest.mark.parametrize("synthesize_audio", [True, False])
async def test_voice_provider_errors_return_an_explicit_failure(
    monkeypatch: pytest.MonkeyPatch, synthesize_audio: bool
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")

    def respond(request: Request) -> Response:
        if "gemini-3.5-flash-lite:" in request.url.path:
            return Response(
                200, json={"candidates": [{"content": {"parts": [{"text": "invalid JSON"}]}}]}
            )
        return Response(503, text="Provider temporarily unavailable")

    requests = _mock_http(monkeypatch, respond)
    result = await SupportService.process_voice(
        "YXVkaW8=", user_name="Dr. Abena", synthesize_audio=synthesize_audio
    )
    assert result == {
        "transcript": "",
        "response": "Speech recognition is unavailable. Please retry or type your message.",
        "action": None,
        "audio_base64": None,
        "audio_mime_type": "audio/wav",
        "error_code": "recognition_unavailable",
    }
    assert len(requests) == 3


async def test_voice_keeps_recent_history_and_can_defer_audio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    history = [
        {"role": "user", "content": "Old question"},
        {"role": "model", "content": "Old answer"},
        {"role": "user", "content": "Another old question"},
        {"role": "assistant", "content": "Checking your balance real quick..."},
        {"role": "user", "content": "What about my cash account?"},
        {"role": "model", "content": ""},
        {"role": "model", "content": "Let me check that cash wallet."},
        {"role": "user", "content": "Include mobile money too."},
        {"role": "assistant", "content": "Pulling up your total balance right away..."},
    ]
    intent = {
        "transcript": "Check all my balances",
        "response": "Getting your current balance right now...",
        "action": {"type": "check_balance", "payload": None},
    }
    requests = _mock_http(
        monkeypatch,
        lambda request: Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": json.dumps(intent)}]}}]},
        ),
    )
    result = await SupportService.process_voice(
        "YXVkaW8=", messages=history, synthesize_audio=False
    )
    assert result == {**intent, "audio_base64": None, "audio_mime_type": "audio/wav"}
    assert len(requests) == 1
    contents = json.loads(requests[0].content)["contents"]
    assert contents[:-1] == [
        {"role": "model", "parts": [{"text": "Checking your balance real quick..."}]},
        {"role": "user", "parts": [{"text": "What about my cash account?"}]},
        {"role": "model", "parts": [{"text": "Let me check that cash wallet."}]},
        {"role": "user", "parts": [{"text": "Include mobile money too."}]},
        {"role": "model", "parts": [{"text": "Pulling up your total balance right away..."}]},
    ]
    assert contents[-1]["role"] == "user"
    assert contents[-1]["parts"][0]["inlineData"]["data"] == "YXVkaW8="


@pytest.mark.parametrize(
    ("transcript", "expected"),
    [("00:00", ""), ("<noise>", ""), (None, ""), (" Check my balance ", "Check my balance")],
)
async def test_voice_filters_non_speech_transcripts(
    monkeypatch: pytest.MonkeyPatch, transcript: str | None, expected: str
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    requests = _mock_http(
        monkeypatch,
        lambda request: Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "transcript": transcript,
                                            "response": "Let me check your available funds.",
                                            "action": {"type": "check_balance", "payload": None},
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        ),
    )
    result = await SupportService.process_voice("YXVkaW8=", synthesize_audio=False)
    assert result["transcript"] == expected
    assert result["response"] == "Let me check your available funds."
    assert result["action"] == {"type": "check_balance", "payload": None}
    assert result["audio_base64"] is None
    assert len(requests) == 1


@pytest.mark.parametrize("pcm_mime", ["audio/L16;rate=24000", "audio/wav;codec=pcm"])
async def test_neural_speech_retries_and_packages_pcm_as_playable_wav(
    monkeypatch: pytest.MonkeyPatch, pcm_mime: str
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    pcm = b"\x00\x00\x64\x00\x9c\xff"

    def respond(request: Request) -> Response:
        if "gemini-2.5-flash-preview-tts:" in request.url.path:
            return Response(503)
        return Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "Audio follows."},
                                {
                                    "inlineData": {
                                        "data": base64.b64encode(pcm).decode(),
                                        "mimeType": pcm_mime,
                                    }
                                },
                            ]
                        }
                    }
                ]
            },
        )

    requests = _mock_http(monkeypatch, respond)
    audio, mime = await SupportService.synthesize_neural_voice(
        "**Hello** [ACTION:NAV_TRANSACTIONS][VOICE_ACTION:ignored]Clifford", "Aoede"
    )
    assert mime == "audio/wav" and audio is not None
    with wave.open(io.BytesIO(base64.b64decode(audio)), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 24000)
        assert wav.readframes(wav.getnframes()) == pcm
    assert len(requests) == 2
    for request in requests:
        assert request.extensions["timeout"] == {
            "connect": 9.5,
            "read": 9.5,
            "write": 9.5,
            "pool": 9.5,
        }
        body = json.loads(request.content)
        assert body["contents"][0]["parts"][0]["text"] == "Hello Clifford"
        assert body["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"] == {
            "voiceName": "Aoede"
        }


async def test_neural_speech_retries_after_invalid_pcm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")

    def respond(request: Request) -> Response:
        if "gemini-2.5-flash-preview-tts:" in request.url.path:
            inline = {"data": "not-valid-base64", "mimeType": "audio/L16;rate=24000"}
        else:
            inline = {"data": "YXVkaW8=", "mimeType": "audio/wav"}
        return Response(
            200, json={"candidates": [{"content": {"parts": [{"inlineData": inline}]}}]}
        )

    requests = _mock_http(monkeypatch, respond)
    assert await SupportService.synthesize_neural_voice("Hello") == ("YXVkaW8=", "audio/wav")
    assert len(requests) == 2


async def test_gemini_keeps_images_and_financial_guardrails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    requests = _mock_http(
        monkeypatch,
        lambda request: Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "Verified guidance"}]}}]}
        ),
    )
    reply = await SupportService.generate_chat_response(
        [
            ChatMessage(role="model", content="How can I help?"),
            ChatMessage(
                role="user",
                content="Help me understand this screen",
                image_base64="data:image/png;base64,aW1hZ2U=",
                image_mime_type="image/png",
            ),
        ],
        user_name="Dr. Abena Poku",
        device_diagnostics={"os": "android", "offline_queue_count": 3},
    )
    assert reply == "Verified guidance"
    assert len(requests) == 1
    body = json.loads(requests[0].content)
    assert body["contents"][0]["role"] == "model"
    assert body["contents"][1]["parts"][1]["inlineData"] == {
        "mimeType": "image/png",
        "data": "aW1hZ2U=",
    }
    prompt = body["systemInstruction"]["parts"][0]["text"]
    assert "User's Actual Name: Abena" in prompt
    assert "NEVER claim" in prompt
    assert "Do NOT start every response" in prompt
    assert "Pending Offline Queue=3" in prompt


@pytest.mark.parametrize("invalid_text", [None, {"unexpected": "object"}])
async def test_non_text_gemini_response_uses_chatgpt(
    monkeypatch: pytest.MonkeyPatch, invalid_text: object
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-openai")

    def respond(request: Request) -> Response:
        if request.url.host == "generativelanguage.googleapis.com":
            return Response(
                200, json={"candidates": [{"content": {"parts": [{"text": invalid_text}]}}]}
            )
        return Response(200, json={"choices": [{"message": {"content": "Fallback guidance"}}]})

    requests = _mock_http(monkeypatch, respond)
    reply = await SupportService.generate_chat_response(
        [ChatMessage(role="user", content="How can I set a budget?")]
    )
    assert reply == "Fallback guidance"
    assert [request.url.host for request in requests] == [
        "generativelanguage.googleapis.com",
        "generativelanguage.googleapis.com",
        "generativelanguage.googleapis.com",
        "api.openai.com",
    ]


@pytest.mark.parametrize("connection_error", [False, True])
async def test_provider_outages_return_local_auth_help(
    monkeypatch: pytest.MonkeyPatch, connection_error: bool
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-openai")

    def respond(request: Request) -> Response:
        if connection_error:
            raise httpx.ConnectError("Provider unavailable", request=request)
        return Response(429, text="Rate limited")

    requests = _mock_http(monkeypatch, respond)
    reply = await SupportService.generate_chat_response(
        [ChatMessage(role="user", content="I cannot receive an OTP")],
        support_type="auth",
        user_name="Mr. Kwame Mensah",
    )
    assert "Kwame" in reply
    assert "verification OTP" in reply
    assert len(requests) == 4


@pytest.mark.parametrize("invalid_text", [None, ["unexpected", "list"]])
async def test_chatgpt_rejects_non_text_content(
    monkeypatch: pytest.MonkeyPatch, invalid_text: object
) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-openai")
    _mock_http(
        monkeypatch,
        lambda request: Response(200, json={"choices": [{"message": {"content": invalid_text}}]}),
    )
    reply = await SupportService._call_chatgpt_fallback(
        [ChatMessage(role="user", content="Help with budgets")], "Support prompt"
    )
    assert reply is None


async def test_github_models_preserves_user_image_and_assistant_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_ACCESS_TOKEN", "test-github")
    requests = _mock_http(
        monkeypatch,
        lambda request: Response(
            200, json={"choices": [{"message": {"content": "Image guidance"}}]}
        ),
    )
    reply = await SupportService._call_chatgpt_fallback(
        [
            ChatMessage(role="model", content="Please share the error"),
            ChatMessage(role="user", content="Here it is", image_mime_type="image/png"),
        ],
        "Support prompt",
        image_base64="data:image/png;base64,aW1hZ2U=",
        image_mime_type="image/png",
    )
    assert reply == "Image guidance"
    assert requests[0].url.host == "models.inference.ai.azure.com"
    body = json.loads(requests[0].content)
    assert body["messages"][1] == {"role": "assistant", "content": "Please share the error"}
    assert body["messages"][2]["content"][1]["image_url"]["url"] == (
        "data:image/png;base64,aW1hZ2U="
    )


@pytest.mark.parametrize("account_type", ["mobile_money", "cash"])
async def test_telemetry_uses_owner_balances_and_ignores_deleted_transactions(
    db_session: AsyncSession, make_user, account_type: str
) -> None:
    user = await make_user(full_name="Abena Poku")
    other = await make_user(phone="+233209876543")
    account = FinancialAccount(
        user_id=user.id,
        name="My wallet",
        account_type=account_type,
        opening_balance=Decimal("10.50"),
    )
    category = Category(user_id=user.id, name="Income", category_type="income")
    db_session.add_all(
        [
            account,
            category,
            FinancialAccount(user_id=other.id, name="Other wallet", account_type="cash"),
        ]
    )
    await db_session.flush()
    for amount, description, deleted in [
        ("2.25", "Received payment", False),
        ("99.00", "Deleted payment", True),
    ]:
        db_session.add(
            Transaction(
                user_id=user.id,
                account_id=account.id,
                category_id=category.id,
                amount=Decimal(amount),
                transaction_type="income",
                description=description,
                transaction_date=date.today(),
                is_deleted=deleted,
            )
        )
    await db_session.flush()
    telemetry, found = await SupportService.build_xray_telemetry(
        db_session, "020 123-4567", {"network_state": "offline"}
    )
    assert found is user
    assert "GH₵ 12.75" in telemetry
    assert "Received payment" in telemetry
    assert "Deleted payment" not in telemetry
    assert "Other wallet" not in telemetry
    expected_momo = "YES" if account_type == "mobile_money" else "NO"
    assert f"Mobile Money Wallet Linked: {expected_momo}" in telemetry


async def test_telemetry_handles_registered_user_without_accounts(
    db_session: AsyncSession, make_user
) -> None:
    user = await make_user()
    telemetry, found = await SupportService.build_xray_telemetry(db_session, user.phone, None)
    assert found is user
    assert "0 linked accounts" in telemetry
    assert "None recorded yet" in telemetry


async def test_sms_batch_rescue_prefers_momo_wallet_and_deduplicates(
    db_session: AsyncSession, make_user
) -> None:
    user = await make_user()
    cash = FinancialAccount(user_id=user.id, name="Cash", account_type="cash")
    momo = FinancialAccount(user_id=user.id, name="MoMo", account_type="mobile_money")
    db_session.add_all([cash, momo])
    await db_session.flush()
    batch = (
        MOMO_SMS + "\n\nYou have transferred GHS 20.00 to Kofi Owusu (0244112233). "
        "Fee charged: GHS 0.20. Your new balance is GHS 80.00. Transaction ID: 194827190."
    )
    first = await SupportService._try_instant_sms_rescue(db_session, user, batch)
    second = await SupportService._try_instant_sms_rescue(db_session, user, batch)
    assert first is not None and "2 transactions logged" in first
    assert second is not None and "Already Recorded in Ledger (2 items)" in second
    assert "[ACTION:NAV_TRANSACTIONS]" in first
    assert "194827189" in second and "GH₵ 50.00" in second
    transactions = list((await db_session.scalars(select(Transaction))).all())
    assert len(transactions) == 2
    assert {transaction.account_id for transaction in transactions} == {momo.id}
    assert {(transaction.transaction_type, transaction.amount) for transaction in transactions} == {
        ("income", Decimal("50.00")),
        ("expense", Decimal("20.00")),
    }
    for reference in ("194827189", "194827190"):
        assert sum(reference in transaction.notes for transaction in transactions) == 1


async def test_sms_rescue_without_wallet_leaves_ledger_unchanged(
    db_session: AsyncSession, make_user
) -> None:
    user = await make_user()
    reply = await SupportService._try_instant_sms_rescue(db_session, user, MOMO_SMS)
    assert reply is not None and "Create a Mobile Money wallet" in reply
    assert (await db_session.scalars(select(Transaction))).all() == []


async def test_offline_sms_rescue_without_session_requests_login() -> None:
    reply = await SupportService.generate_chat_response(
        [ChatMessage(role="user", content=MOMO_SMS)]
    )
    assert "Instant SMS Rescue Parsed" in reply
    assert "Log in to an active account" in reply


@pytest.mark.parametrize(
    ("pr_state", "issue_state", "expected_status", "expected_step"),
    [
        ("merged", "closed", "update_available", 4),
        ("open", "open", "testing", 3),
        (None, "open", "investigating", 2),
        (None, "closed", "received", 1),
    ],
)
async def test_ticket_status_translates_pr_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
    pr_state: str | None,
    issue_state: str,
    expected_status: str,
    expected_step: int,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_ACCESS_TOKEN", "test-github")

    def respond(request: Request) -> Response:
        if request.url.path.endswith("/comments"):
            return Response(200, json=[{"body": "ChatGPT " + "details " * 100}])
        if request.url.path.endswith("/pulls"):
            pulls = (
                [
                    {
                        "html_url": "https://example.invalid/pull/43",
                        "state": pr_state,
                        "merged_at": "2026-10-19T00:00:00Z" if pr_state == "merged" else None,
                    }
                ]
                if pr_state
                else []
            )
            return Response(200, json=pulls)
        return Response(
            200,
            json={
                "state": issue_state,
                "title": "Support ticket",
                "html_url": "https://example.invalid/issues/42",
                "labels": [{"name": "support"}, "invalid-label"],
            },
        )

    requests = _mock_http(monkeypatch, respond)
    result = await SupportService.get_ticket_status(42)
    assert result["user_status"] == expected_status
    assert result["stage_step"] == expected_step
    assert result["pr_state"] == pr_state
    assert result["labels"] == ["support"]
    assert len(result["latest_agent_comment"]) == 500
    assert len(requests) == 3


@pytest.mark.parametrize("connection_error", [False, True])
async def test_ticket_status_survives_github_outage(
    monkeypatch: pytest.MonkeyPatch, connection_error: bool
) -> None:
    monkeypatch.setattr(settings, "GITHUB_ACCESS_TOKEN", "test-github")

    def respond(request: Request) -> Response:
        if connection_error:
            raise httpx.ConnectError("GitHub unavailable", request=request)
        return Response(503)

    _mock_http(monkeypatch, respond)
    result = await SupportService.get_ticket_status(42)
    assert result["user_status"] == "received"
    assert result["stage_step"] == 1
    assert result["pr_url"] is None


async def test_ticket_status_without_github_token_stays_pending() -> None:
    result = await SupportService.get_ticket_status(42)
    assert result["state"] == "open"
    assert result["user_status"] == "received"
    assert result["stage_step"] == 1


async def test_discord_alert_without_webhook_makes_no_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = _mock_http(monkeypatch, lambda request: Response(204))
    await SupportService._send_discord_alert(
        "+233200000000", "Help", "ticket", "database_only", None
    )
    assert requests == []


async def test_discord_alert_includes_diagnostics_and_issue_link(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "DISCORD_WEBHOOK_URL", "https://example.invalid/webhook")
    requests = _mock_http(monkeypatch, lambda request: Response(204))
    await SupportService._send_discord_alert(
        "+233200000000", "Help", "ticket", "https://example.invalid/issues/42", {"os": "ios"}
    )
    fields = json.loads(requests[0].content)["embeds"][0]["fields"]
    assert any("os: ios" in field["value"] for field in fields)
    assert any("issues/42" in field["value"] for field in fields)
