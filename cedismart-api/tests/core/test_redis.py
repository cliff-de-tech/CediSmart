"""Regression coverage for cache outages, expiry, and token revocation."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import redis.asyncio as aioredis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core import redis as redis_module
from app.core.redis import ResilientRedis


def _redis_client():
    client = Mock(spec=aioredis.Redis)
    # Redis command methods return awaitables but are not declared with async def.
    for command in ("get", "set", "delete", "exists", "ping", "close"):
        setattr(client, command, AsyncMock())
    return client


async def test_connected_cache_uses_remote_values() -> None:
    client = _redis_client()
    client.get.return_value = "remote-value"
    client.exists.return_value = 1
    client.delete.return_value = 2

    async def scan(**kwargs):
        yield "cache:one"
        yield "cache:two"

    client.scan_iter = scan
    cache = ResilientRedis(client)
    await cache.set("cache:one", "local-value", ex=60)
    assert await cache.get("cache:one") == "remote-value"
    assert await cache.exists("cache:one") == 1
    assert [key async for key in cache.scan_iter(match="cache:*", count=10)] == [
        "cache:one",
        "cache:two",
    ]
    assert await cache.delete("cache:one", "cache:two") == 2
    client.set.assert_awaited_once_with("cache:one", "local-value", ex=60)


async def test_connection_loss_preserves_local_writes_and_revocations() -> None:
    client = _redis_client()
    cache = ResilientRedis(client)
    await cache.set("refresh:session", "user-id", ex=60)
    await cache.set("cache:report", "report", ex=60)
    client.get.side_effect = RedisConnectionError("Redis is unavailable")

    assert await cache.get("cache:report") == "report"
    assert await cache.get("refresh:session") == "user-id"
    assert await cache.exists("refresh:session") == 1
    assert await cache.delete("refresh:session", "cache:report") == 2
    assert await cache.exists("refresh:session") == 0
    assert await cache.get("cache:report") is None
    assert await cache.delete("cache:report") == 0


async def test_fallback_expires_values_and_filters_scan(monkeypatch) -> None:
    clock = [100.0]
    monkeypatch.setattr(redis_module, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    cache = ResilientRedis(_redis_client(), is_connected=False)
    await cache.set("cache:temporary", "short-lived", ex=10)
    await cache.set("cache:permanent", "retained")
    await cache.set("other:key", "unrelated")

    assert await cache.get("cache:temporary") == "short-lived"
    assert await cache.exists("cache:temporary") == 1
    clock[0] = 111.0
    assert [key async for key in cache.scan_iter(match="cache:*")] == ["cache:permanent"]
    assert await cache.get("cache:temporary") is None
    assert await cache.exists("cache:temporary") == 0
    assert await cache.get("cache:permanent") == "retained"


@pytest.mark.parametrize("operation", ["set", "delete", "exists", "scan"])
async def test_command_outages_use_the_fallback(operation: str) -> None:
    client = _redis_client()
    cache = ResilientRedis(client)
    await cache.set("cache:report", "report")

    async def unavailable_scan(**kwargs):
        raise RedisConnectionError("Redis is unavailable")
        yield  # Make this an async iterator like redis.scan_iter.

    if operation == "scan":
        client.scan_iter = unavailable_scan
        assert [key async for key in cache.scan_iter()] == ["cache:report"]
    else:
        getattr(client, operation).side_effect = RedisConnectionError("Redis is unavailable")
        if operation == "set":
            await cache.set("cache:new", "new report")
            assert await cache.get("cache:new") == "new report"
        elif operation == "delete":
            assert await cache.delete("cache:report") == 1
            assert await cache.get("cache:report") is None
        else:
            assert await cache.exists("cache:report") == 1


@pytest.mark.parametrize("connected", [True, False])
async def test_pool_lifecycle_handles_startup_and_shutdown_failures(monkeypatch, connected) -> None:
    client = _redis_client()
    if not connected:
        client.ping.side_effect = OSError("Redis is unavailable")
    client.close.side_effect = OSError("Connection already closed")
    factory = Mock(return_value=client)
    monkeypatch.setattr(redis_module.aioredis, "from_url", factory)
    monkeypatch.setattr(redis_module, "redis_pool", None)

    dependency = redis_module.get_redis()
    cache = await anext(dependency)
    assert isinstance(cache, ResilientRedis)
    if not connected:
        await cache.set("cache:startup", "works offline")
        assert await cache.get("cache:startup") == "works offline"
    await dependency.aclose()
    await redis_module.close_redis()
    assert redis_module.redis_pool is None
    client.close.assert_awaited_once()
    await redis_module.close_redis()
    factory.assert_called_once()
