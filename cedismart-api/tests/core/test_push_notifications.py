"""Push delivery must remove rejected tokens without interrupting API requests."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.push_notifications import send_push_notification
from app.modules.auth.models import UserDeviceToken


def _session_with_tokens(*tokens):
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = tokens
    session.execute.return_value = result
    return session


async def test_rejected_push_tokens_are_removed_without_affecting_other_devices() -> None:
    active = UserDeviceToken(token="ExponentPushToken[active]", user_id=uuid.uuid4())
    rejected = UserDeviceToken(token="ExponentPushToken[rejected]", user_id=active.user_id)
    session = _session_with_tokens(active, rejected)
    response = httpx.Response(
        200,
        json={
            "data": [
                {"status": "ok"},
                {"status": "error", "details": {"error": "DeviceNotRegistered"}},
            ]
        },
    )
    client = AsyncMock()
    client.post.return_value = response
    with patch("app.core.push_notifications.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        await send_push_notification(
            active.user_id, "Budget warning", "80% spent", {"screen": "Budgets"}, session
        )

    payloads = client.post.call_args.kwargs["json"]
    assert [payload["to"] for payload in payloads] == [active.token, rejected.token]
    assert all(payload["data"] == {"screen": "Budgets"} for payload in payloads)
    session.delete.assert_awaited_once_with(rejected)
    session.commit.assert_awaited_once()


@pytest.mark.parametrize("unavailable", [False, True])
async def test_push_service_failure_does_not_delete_tokens(unavailable: bool) -> None:
    token = UserDeviceToken(token="ExponentPushToken[active]", user_id=uuid.uuid4())
    session = _session_with_tokens(token)
    client = AsyncMock()
    if unavailable:
        client.post.side_effect = httpx.ConnectError("Expo is unavailable")
    else:
        client.post.return_value = httpx.Response(503, text="Unavailable")
    with patch("app.core.push_notifications.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        await send_push_notification(token.user_id, "Budget warning", "80% spent", db=session)

    session.delete.assert_not_awaited()
    session.commit.assert_not_awaited()


async def test_no_devices_or_session_skips_push_delivery() -> None:
    with patch("app.core.push_notifications.httpx.AsyncClient") as factory:
        await send_push_notification(uuid.uuid4(), "Title", "Body")
        await send_push_notification(uuid.uuid4(), "Title", "Body", db=_session_with_tokens())
    factory.assert_not_called()
