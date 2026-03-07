"""Shared test fixtures for the CediSmart API test suite.

Provides an async test database session, a test HTTP client,
and convenience fixtures for authenticated requests.
"""

from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app

# ---------------------------------------------------------------------------
# Test database — uses SQLite async for fast, isolated test runs.
# For integration tests against Postgres, override TEST_DATABASE_URL.
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


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
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client with the test DB injected."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Return placeholder auth headers. Override in module-level conftest
    once the auth module is implemented to provide real JWT tokens.
    """
    return {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def assert_error_response(response: Any, status_code: int, error_code: str) -> None:
    """Assert that a response matches the standard error envelope."""
    assert response.status_code == status_code
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == error_code
