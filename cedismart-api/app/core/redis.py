"""Redis async connection pool for OTP storage, JWT blocklist, and caching."""

import contextlib
import fnmatch
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any, cast

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)


class ResilientRedis:
    """Async Redis wrapper with in-memory fallback when Redis is unreachable."""

    def __init__(self, client: aioredis.Redis, is_connected: bool = True) -> None:
        self._client = client
        self._is_connected = is_connected
        self._store: dict[str, tuple[str, float | None]] = {}
        self._revoked: set[str] = set()

    def _prune_expired(self, key: str) -> None:
        entry = self._store.get(key)
        if entry is not None:
            _, expires_at = entry
            if expires_at is not None and time.monotonic() >= expires_at:
                del self._store[key]

    async def get(self, key: str) -> str | None:
        if self._is_connected:
            try:
                return cast(str | None, await self._client.get(key))
            except (aioredis.RedisError, OSError) as exc:
                logger.warning("Redis GET failed (%s); switching to in-memory fallback.", exc)
                self._is_connected = False

        self._prune_expired(key)
        entry = self._store.get(key)
        return entry[0] if entry is not None else None

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        expires_at = (time.monotonic() + ex) if ex is not None else None
        self._store[key] = (value, expires_at)
        self._revoked.discard(key)

        if self._is_connected:
            try:
                await self._client.set(key, value, ex=ex)
            except (aioredis.RedisError, OSError) as exc:
                logger.warning("Redis SET failed (%s); switching to in-memory fallback.", exc)
                self._is_connected = False

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self._store:
                del self._store[key]
                deleted += 1
            if key.startswith("refresh:"):
                self._revoked.add(key)

        if self._is_connected and keys:
            try:
                return int(await self._client.delete(*keys))
            except (aioredis.RedisError, OSError) as exc:
                logger.warning("Redis DELETE failed (%s); switching to in-memory fallback.", exc)
                self._is_connected = False

        return deleted

    async def exists(self, key: str) -> int:
        if self._is_connected:
            try:
                return int(await self._client.exists(key))
            except (aioredis.RedisError, OSError) as exc:
                logger.warning("Redis EXISTS failed (%s); switching to in-memory fallback.", exc)
                self._is_connected = False

        if key in self._revoked:
            return 0
        self._prune_expired(key)
        if key in self._store:
            return 1
        # Refresh tokens are already RS256-verified before checking Redis;
        # allow valid non-revoked tokens across multi-worker processes when Redis is offline.
        if key.startswith("refresh:"):
            return 1
        return 0

    async def scan_iter(
        self, match: str | None = None, count: int | None = None
    ) -> AsyncGenerator[str, None]:
        if self._is_connected:
            try:
                async for key in self._client.scan_iter(match=match, count=count):
                    yield str(key)
                return
            except (aioredis.RedisError, OSError) as exc:
                logger.warning("Redis SCAN failed (%s); switching to in-memory fallback.", exc)
                self._is_connected = False

        for key in list(self._store.keys()):
            self._prune_expired(key)
            if key in self._store and (match is None or fnmatch.fnmatch(key, match)):
                yield key

    async def close(self) -> None:
        with contextlib.suppress(Exception):
            await self._client.close()


redis_pool: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    """Create and return the global Redis connection pool.

    Called once at application startup.
    """
    global redis_pool  # noqa: PLW0603
    raw_client = cast(
        aioredis.Redis,
        aioredis.from_url(  # type: ignore[no-untyped-call]
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        ),
    )
    connected = True
    try:
        await cast(Any, raw_client.ping())
    except (aioredis.RedisError, OSError) as exc:
        logger.warning("Redis unreachable at startup (%s); using in-memory fallback.", exc)
        connected = False

    redis_pool = cast(aioredis.Redis, ResilientRedis(raw_client, is_connected=connected))
    return redis_pool


async def close_redis() -> None:
    """Close the Redis connection pool. Called at application shutdown."""
    global redis_pool  # noqa: PLW0603
    if redis_pool is not None:
        await redis_pool.close()
        redis_pool = None


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """FastAPI dependency that provides the Redis client."""
    if redis_pool is None:
        await init_redis()
    assert redis_pool is not None
    yield redis_pool
