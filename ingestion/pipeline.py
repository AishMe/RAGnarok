import logging
from dataclasses import dataclass
from pathlib import Path

from config.settings import settings
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


def run_ingestion(
    pdf_folder: str | None = None,
    urls: list[str] | None = None,
    json_records: list[dict] | None = None,
    json_content_key: str = "content",
    json_metadata_keys: list[str] | None = None,
    chunk_strategy: str | None = None,
) -> list[IngestionResult]:
    """
    Master ingestion function — loads from any/all sources, chunks, stores.
    Each source returns its own IngestionResult so you know exactly what happened.

    Production design decisions:
    - Each source is independent — a failed URL doesn't stop PDF ingestion
    - chunk_strategy defaults to settings.chunk_strategy (from .env)
    - Returns results not exceptions — caller decides what to do with errors
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
            result.chunks_created = len(chunks)
            result.chunks_added = add_documents(chunks)
        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"JSON ingestion failed: {e}")
        results.append(result)

    # ── Summary ───────────────────────────────────────────────────────────────
    total_added = sum(r.chunks_added for r in results)
    stats = collection_stats()
    logger.info(
        f"Ingestion complete: {total_added} new chunks added. "
        f"Total in store: {stats['total_chunks']}"
    )
    return results
