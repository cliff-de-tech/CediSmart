"""Async SQLAlchemy engine, session factory, declarative base, and shared mixins.

The engine and session factory are created lazily via ``get_engine()`` / ``get_session_factory()``
so that importing this module does not require a live database connection. This allows
models to be imported and inspected without a running DB (e.g. for tests, linting).
"""

from collections.abc import AsyncGenerator
from datetime import datetime

from sqlalchemy import TIMESTAMP, func
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# ---------------------------------------------------------------------------
# Declarative base & mixins (import-safe, no DB connection needed)
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""

    pass


class TimestampMixin:
    """Mixin that adds created_at and updated_at columns to any model.

    - created_at: set once at row creation (server-side NOW()).
    - updated_at: set at creation and refreshed on every UPDATE.
    """

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ---------------------------------------------------------------------------
# Lazy engine & session factory (created on first access)
# ---------------------------------------------------------------------------

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return the async engine, creating it on first call."""
    global _engine  # noqa: PLW0603
    if _engine is None:
        from app.core.config import settings

        _engine = create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DEBUG,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the session factory, creating it on first call."""
    global _session_factory  # noqa: PLW0603
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session.

    The session is automatically closed after the request completes.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
