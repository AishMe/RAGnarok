import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from generation.rag_chain import get_rag_chain_with_sources
from ingestion.cache import cache_stats, invalidate_query_cache

rag = get_rag_chain_with_sources(k=4)
question = "What is the importance of saving money?"

print("Run 1 — cache miss (slow)")
t0 = time.time()
r1 = rag(question)
t1 = time.time()
print(f"  from_cache: {r1['from_cache']}")
print(f"  time: {t1-t0:.2f}s")
print(f"  answer: {r1['answer'][:100]}...\n")

print("Run 2 — cache hit (fast)")
t0 = time.time()
r2 = rag(question)
t1 = time.time()
print(f"  from_cache: {r2['from_cache']}")
print(f"  time: {t1-t0:.2f}s\n")

print(f"Cache stats: {cache_stats()}")

print("\nInvalidating cache...")
invalidate_query_cache()
print(f"Cache stats after invalidation: {cache_stats()}")
