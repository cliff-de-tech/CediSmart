"""SMS client unit tests — Termii integration paths."""

import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.exceptions import AppException


async def test_send_otp_stub_when_no_api_key() -> None:
    """No TERMII_API_KEY → logs warning, makes no HTTP call."""
    with patch("app.core.sms.settings") as mock_settings:
        mock_settings.TERMII_API_KEY = ""

        from app.core import sms
        with patch.object(sms.logger, "warning") as mock_warn:
            await sms.send_otp("+233201234567", "123456")
            mock_warn.assert_called_once()


async def test_send_otp_timeout() -> None:
    """Timeout raises 503 AppException."""
    with patch("app.core.sms.settings") as mock_settings:
        mock_settings.TERMII_API_KEY = "test-key"
        mock_settings.TERMII_SENDER_ID = "CediSmart"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        from app.core import sms
        with patch("app.core.sms.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AppException) as exc_info:
                await sms.send_otp("+233201234567", "123456")
            assert exc_info.value.status_code == 503
            assert exc_info.value.error_code == "SMS_DELIVERY_FAILED"


async def test_send_otp_network_error() -> None:
    """Network error raises 503 AppException."""
    with patch("app.core.sms.settings") as mock_settings:
        mock_settings.TERMII_API_KEY = "test-key"
        mock_settings.TERMII_SENDER_ID = "CediSmart"

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

        from app.core import sms
        with patch("app.core.sms.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AppException) as exc_info:
                await sms.send_otp("+233201234567", "123456")
            assert exc_info.value.status_code == 503


async def test_send_otp_non_200_response() -> None:
    """HTTP non-200 raises 503 AppException."""
    with patch("app.core.sms.settings") as mock_settings:
        mock_settings.TERMII_API_KEY = "test-key"
        mock_settings.TERMII_SENDER_ID = "CediSmart"

        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        from app.core import sms
        with patch("app.core.sms.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AppException) as exc_info:
                await sms.send_otp("+233201234567", "123456")
            assert exc_info.value.status_code == 503


async def test_send_otp_termii_rejection() -> None:
    """Termii returns 200 but code != 'ok' raises 503."""
    with patch("app.core.sms.settings") as mock_settings:
        mock_settings.TERMII_API_KEY = "test-key"
        mock_settings.TERMII_SENDER_ID = "CediSmart"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"code": "error", "message": "insufficient credits"})

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        from app.core import sms
        with patch("app.core.sms.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AppException) as exc_info:
                await sms.send_otp("+233201234567", "123456")
            assert exc_info.value.status_code == 503


async def test_send_otp_success() -> None:
    """Successful Termii response returns None (no exception)."""
    with patch("app.core.sms.settings") as mock_settings:
        mock_settings.TERMII_API_KEY = "test-key"
        mock_settings.TERMII_SENDER_ID = "CediSmart"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"code": "ok", "message": "Successfully Sent"})

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        from app.core import sms
        with patch("app.core.sms.httpx.AsyncClient", return_value=mock_client):
            result = await sms.send_otp("+233201234567", "123456")
            assert result is None
