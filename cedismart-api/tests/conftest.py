"""Shared fixtures for the CediSmart API test suite.

IMPORTANT: env vars are set at the TOP of this module — before any app imports —
so pydantic-settings picks them up when Settings() is instantiated.
"""

import fnmatch
import os
import uuid as _uuid

# ---------------------------------------------------------------------------
# Inject test environment variables BEFORE any app module is imported.
# pydantic-settings reads env vars when Settings() is called at import time.
# ---------------------------------------------------------------------------

if not os.environ.get("RSA_PRIVATE_KEY"):
    from cryptography.hazmat.primitives import serialization as _ser
    from cryptography.hazmat.primitives.asymmetric import rsa as _rsa

    _priv = _rsa.generate_private_key(public_exponent=65537, key_size=2048)
    os.environ["RSA_PRIVATE_KEY"] = _priv.private_bytes(
        _ser.Encoding.PEM,
        _ser.PrivateFormat.TraditionalOpenSSL,
        _ser.NoEncryption(),
    ).decode()
    os.environ["RSA_PUBLIC_KEY"] = (
        _priv.public_key()
        .public_bytes(
            _ser.Encoding.PEM,
            _ser.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("TERMII_API_KEY", "")  # Disable real SMS in tests

# ---------------------------------------------------------------------------
# App imports — after env setup
# ---------------------------------------------------------------------------

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.redis import get_redis
from app.core.security import create_access_token, hash_pin
from app.main import app
from app.modules.auth.models import User

# ---------------------------------------------------------------------------
# Test database — SQLite for local dev; CI overrides via TEST_DATABASE_URL env var
# ---------------------------------------------------------------------------

_TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///./test.db")

test_engine = create_async_engine(_TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# Fake Redis — in-memory drop-in for tests
# ---------------------------------------------------------------------------


class FakeRedis:
    """Minimal async Redis shim sufficient for all auth/cache operations."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self._store:
                del self._store[key]
                deleted += 1
        return deleted

    async def exists(self, key: str) -> int:
        return 1 if key in self._store else 0

    async def scan_iter(
        self, match: str | None = None, count: int | None = None
    ) -> AsyncGenerator[str, None]:
        for key in list(self._store.keys()):
            if match is None or fnmatch.fnmatch(key, match):
                yield key

    def clear(self) -> None:
        self._store.clear()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_database() -> AsyncGenerator[None, None]:
    """Create all tables before each test, drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a clean async database session for each test."""
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
def fake_redis() -> FakeRedis:
    """Provide a fresh in-memory Redis for each test."""
    return FakeRedis()


@pytest.fixture
async def client(
    db_session: AsyncSession, fake_redis: FakeRedis
) -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with test DB and fake Redis injected.

    Set TEST_USE_REAL_REDIS=1 in the environment to skip the fake Redis override
    and exercise the real Redis dependency (e.g., in CI against a live Redis).
    """

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    async def _override_get_redis() -> AsyncGenerator[FakeRedis, None]:
        yield fake_redis

    app.dependency_overrides[get_db] = _override_get_db
    use_real_redis = os.environ.get("TEST_USE_REAL_REDIS", "").lower() in ("1", "true", "yes")
    if not use_real_redis:
        app.dependency_overrides[get_redis] = _override_get_redis  # type: ignore[assignment]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def mock_send_otp() -> AsyncGenerator[AsyncMock, None]:
    """Prevent real Termii calls in all tests.

    Patch the reference inside auth/service (where it was imported),
    not the original in app.core.sms — otherwise SMS unit tests that
    call sms.send_otp directly would hit the mock instead of the real code.
    """
    with patch("app.modules.auth.service.send_otp", new_callable=AsyncMock) as m:
        yield m


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    """Clear slowapi's in-memory rate limit counters between tests."""
    from app.modules.auth.router import limiter

    try:
        limiter._storage.reset()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Test-user factory
# ---------------------------------------------------------------------------


@pytest.fixture
def make_user(db_session: AsyncSession):  # type: ignore[no-untyped-def]
    """Return an async factory that creates a User directly in the test DB."""

    async def _factory(
        phone: str = "+233201234567",
        pin: str = "123456",
        full_name: str = "Test User",
        currency: str = "GHS",
        is_active: bool = True,
        is_premium: bool = False,
    ) -> User:
        user = User(
            phone=phone,
            pin_hash=hash_pin(pin),
            full_name=full_name,
            currency=currency,
            is_active=is_active,
            is_premium=is_premium,
        )
        db_session.add(user)
        await db_session.flush()
        return user

    return _factory


def make_auth_headers(user_id: _uuid.UUID) -> dict[str, str]:
    """Return Authorization headers containing a valid JWT access token."""
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Assertion helper
# ---------------------------------------------------------------------------


def assert_error_response(response: Any, status_code: int, error_code: str) -> None:
    """Assert a response matches the standard CediSmart error envelope."""
    assert response.status_code == status_code
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == error_code
