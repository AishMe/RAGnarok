import hashlib
import json
import logging

import redis

from config.settings import settings

logger = logging.getLogger(__name__)


def _get_client() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _query_key(question: str, k: int) -> str:
    """Stable cache key for a query — hash of question + k."""
    h = hashlib.md5(f"{question.strip().lower()}:{k}".encode()).hexdigest()
    return f"rag:query:{h}"


def _embedding_key(text: str) -> str:
    h = hashlib.md5(text.strip().lower().encode()).hexdigest()
    return f"rag:embedding:{h}"


# ── Query cache ───────────────────────────────────────────────────────────────


def get_cached_query(question: str, k: int = 4) -> dict | None:
    """
    Returns cached RAG response if it exists, else None.
    TTL=3600: cached answers expire after 1 hour.
    Why cache queries? LLM calls are the slowest part (~2-5s).
    Same question asked twice returns instantly from cache.
    """
    try:
        client = _get_client()
        key = _query_key(question, k)
        val = client.get(key)
        if val:
            logger.debug(f"Cache HIT: {question[:50]}")
            return json.loads(val)
        logger.debug(f"Cache MISS: {question[:50]}")
        return None
    except Exception as e:
        logger.warning(f"Cache read failed (degraded gracefully): {e}")
        return None


def set_cached_query(question: str, result: dict, k: int = 4, ttl: int = 3600):
    """
    Cache a RAG response. Fails silently — cache is optional, never blocks the pipeline.
    ttl=3600: 1 hour. Tune down for frequently-updated document collections.
    """
    try:
        client = _get_client()
        key = _query_key(question, k)
        client.setex(key, ttl, json.dumps(result))
    except Exception as e:
        logger.warning(f"Cache write failed (degraded gracefully): {e}")


def invalidate_query_cache():
    """
    Clear all query caches — call this after ingesting new documents.
    Otherwise users get stale answers about documents that have changed.
    """
    try:
        client = _get_client()
        keys = client.keys("rag:query:*")
        if keys:
            client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cached queries")
    except Exception as e:
        logger.warning(f"Cache invalidation failed: {e}")


def cache_stats() -> dict:
    """How many items are cached — useful for the /api/stats endpoint."""
    try:
        client = _get_client()
        query_keys = len(client.keys("rag:query:*"))
        embedding_keys = len(client.keys("rag:embedding:*"))
        return {
            "cached_queries": query_keys,
            "cached_embeddings": embedding_keys,
            "redis_url": settings.redis_url,
        }
    except Exception as e:
        return {"error": str(e)}
