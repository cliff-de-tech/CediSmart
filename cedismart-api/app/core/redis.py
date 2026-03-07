"""Redis async connection pool for OTP storage, JWT blocklist, and caching."""

from collections.abc import AsyncGenerator

import redis.asyncio as aioredis

from app.core.config import settings

redis_pool: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    """Create and return the global Redis connection pool.

    Called once at application startup.
    """
    global redis_pool  # noqa: PLW0603
    redis_pool = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        max_connections=20,
    )
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
        raise RuntimeError("Redis pool not initialized. Call init_redis() at startup.")
    yield redis_pool
