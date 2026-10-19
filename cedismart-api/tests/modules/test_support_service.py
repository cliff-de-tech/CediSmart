"""Exercise support integrations with mocked HTTP and the real test database."""

import json
from collections.abc import Callable
from datetime import date
from decimal import Decimal

import httpx
import pytest
from httpx import AsyncClient, MockTransport, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
def isolated_support_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "GEMINI_API_KEY",
        "OPENAI_API_KEY",
        "GITHUB_ACCESS_TOKEN",
        "DISCORD_WEBHOOK_URL",
        "DISCORD_FEEDBACK_WEBHOOK_URL",
    ):
        monkeypatch.setattr(settings, name, None)


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
    assert len(requests) == 2


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


async def test_sms_rescue_prefers_momo_wallet_and_deduplicates(
    db_session: AsyncSession, make_user
) -> None:
    user = await make_user()
    cash = FinancialAccount(user_id=user.id, name="Cash", account_type="cash")
    momo = FinancialAccount(user_id=user.id, name="MoMo", account_type="mobile_money")
    db_session.add_all([cash, momo])
    await db_session.flush()
    first = await SupportService._try_instant_sms_rescue(db_session, user, MOMO_SMS)
    second = await SupportService._try_instant_sms_rescue(db_session, user, MOMO_SMS)
    assert first is not None and "Rescue Complete" in first
    assert second is not None and "Already Synced" in second
    assert "[ACTION:NAV_TRANSACTIONS]" in first
    assert "[ACTION:NAV_TRANSACTIONS]" in second
    transactions = list((await db_session.scalars(select(Transaction))).all())
    assert len(transactions) == 1
    assert transactions[0].account_id == momo.id
    assert transactions[0].amount == Decimal("50.00")
    assert "194827189" in transactions[0].notes


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
