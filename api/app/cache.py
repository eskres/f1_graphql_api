from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from redis import asyncio as aioredis
import os

WEEK_TTL = 60 * 60 * 24 * 7
MONTH_TTL = 60 * 60 * 24 * 30
RECENT_RACE_TTL = 60 * 60 * 24 * 3

async def setup_cache():
    redis = aioredis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379"),
        encoding="utf8",
        decode_responses=True
    )
    FastAPICache.init(RedisBackend(redis), prefix="f1-cache")