import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from config.settings import settings
from ingestion.cache import invalidate_query_cache
from ingestion.chunker import get_chunker
from ingestion.loaders import load_json_records, load_pdf_folder, load_urls
from ingestion.vector_store import add_documents, collection_stats

logger = logging.getLogger(__name__)


@dataclass
class IngestionResult:
    source: str
    docs_loaded: int
    chunks_created: int
    chunks_added: int
    errors: list[str]


def _tag_username(chunks, username: str):
    """Stamp every chunk with the owner's username for isolation."""
    for chunk in chunks:
        chunk.metadata["username"] = username
    return chunks


def run_ingestion(
    pdf_folder: str | None = None,
    urls: list[str] | None = None,
    json_records: list[dict] | None = None,
    json_content_key: str = "content",
    json_metadata_keys: list[str] | None = None,
    chunk_strategy: str | None = None,
    username: Optional[str] = None,  # owner — stamped on every chunk
) -> list[IngestionResult]:
    """
    Master ingestion function.
    username is required in production so chunks are isolated per user.
    """
    strategy = chunk_strategy or settings.chunk_strategy
    chunker = get_chunker(strategy)
    results = []

    # ── PDFs ──────────────────────────────────────────────────────────────────
    if pdf_folder and Path(pdf_folder).exists():
        result = IngestionResult(
            source=pdf_folder,
            docs_loaded=0,
            chunks_created=0,
            chunks_added=0,
            errors=[],
        )
        try:
            docs = load_pdf_folder(pdf_folder)
            result.docs_loaded = len(docs)
            chunks = chunker(docs)
            if username:
                chunks = _tag_username(chunks, username)
            result.chunks_created = len(chunks)
            result.chunks_added = add_documents(chunks)
        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"PDF ingestion failed: {e}")
        results.append(result)

    # ── URLs ──────────────────────────────────────────────────────────────────
    if urls:
        result = IngestionResult(
            source="urls", docs_loaded=0, chunks_created=0, chunks_added=0, errors=[]
        )
        try:
            docs = load_urls(urls)
            result.docs_loaded = len(docs)
            chunks = chunker(docs)
            if username:
                chunks = _tag_username(chunks, username)
            result.chunks_created = len(chunks)
            result.chunks_added = add_documents(chunks)
        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"URL ingestion failed: {e}")
        results.append(result)

    # ── JSON / API ─────────────────────────────────────────────────────────────
    if json_records:
        result = IngestionResult(
            source="json", docs_loaded=0, chunks_created=0, chunks_added=0, errors=[]
        )
        try:
            docs = load_json_records(
                json_records,
                content_key=json_content_key,
                metadata_keys=json_metadata_keys,
            )
            result.docs_loaded = len(docs)
            chunks = chunker(docs)
            if username:
                chunks = _tag_username(chunks, username)
            result.chunks_created = len(chunks)
            result.chunks_added = add_documents(chunks)
        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"JSON ingestion failed: {e}")
        results.append(result)

    total_added = sum(r.chunks_added for r in results)
    stats = collection_stats()
    logger.info(
        f"Ingestion complete: {total_added} new chunks. Total in store: {stats['total_chunks']}"
    )

    if any(r.chunks_added > 0 for r in results):
        invalidate_query_cache()

    return results
