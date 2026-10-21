"""Public health metadata must not include configured credential material."""

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.parametrize("api_key", [None, "unit-test-key-never-public"])
async def test_health_exposes_configuration_status_without_credentials(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, api_key: str | None
) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", api_key)
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "version": "0.1.2",
        "has_gemini": bool(api_key),
    }
    if api_key:
        assert api_key[:6] not in response.text
