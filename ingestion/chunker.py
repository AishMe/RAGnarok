import logging

from langchain_core.documents import Document
from langchain_experimental.text_splitter import SemanticChunker
from langchain_text_splitters import RecursiveCharacterTextSplitter

from ingestion.embeddings import get_embeddings

logger = logging.getLogger(__name__)

# ── strategy 1: recursive character (default for v1) ─────────────────────────


def chunk_recursive(
    docs: list[Document],
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[Document]:
    """
    Best default for most documents.
    Splits on paragraphs → sentences → words → characters in that priority order.
    chunk_size=512: fits ~400 tokens, leaves room in LLM context for multiple chunks.
    chunk_overlap=64: 12% overlap prevents answers split across chunk boundaries.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    # carry original metadata + add chunk index
    for i, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = i
        chunk.metadata["chunk_size"] = len(chunk.page_content)
    logger.info(f"Recursive chunking: {len(docs)} docs → {len(chunks)} chunks")
    return chunks


# ── strategy 2: semantic chunker (experiment phase) ───────────────────────────


def chunk_semantic(docs: list[Document]) -> list[Document]:
    """
    Splits at natural semantic boundaries using embeddings.
    Better quality than recursive, but 10-20x slower — only use for small corpora
    or when retrieval quality matters more than ingestion speed.
    """
    splitter = SemanticChunker(
        get_embeddings(),
        breakpoint_threshold_type="percentile",
        breakpoint_threshold_amount=95,
    )
    chunks = splitter.split_documents(docs)
    for i, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = i
        chunk.metadata["chunk_size"] = len(chunk.page_content)
    logger.info(f"Semantic chunking: {len(docs)} docs → {len(chunks)} chunks")
    return chunks


# ── strategy 3: sentence window (experiment phase) ────────────────────────────


def chunk_sentence_window(
    docs: list[Document],
    window_size: int = 3,
) -> list[Document]:
    """
    Store small sentence chunks but attach surrounding context window.
    At retrieval time: search on small chunk (precise), feed window to LLM (context-rich).
    window_size=3: the chunk plus 1 sentence before and 1 sentence after.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=256,
        chunk_overlap=32,
        separators=[". ", "\n", " "],
    )
    chunks = splitter.split_documents(docs)
    # attach window context to each chunk's metadata
    for i, chunk in enumerate(chunks):
        start = max(0, i - window_size // 2)
        end = min(len(chunks), i + window_size // 2 + 1)
        window_text = " ".join(c.page_content for c in chunks[start:end])
        chunk.metadata["window_text"] = window_text
        chunk.metadata["chunk_index"] = i
    logger.info(f"Sentence-window chunking: {len(docs)} docs → {len(chunks)} chunks")
    return chunks


# ── factory: pick strategy from config ───────────────────────────────────────


def get_chunker(strategy: str = "recursive"):
    """
    Returns the chunking function for the given strategy.
    strategy: "recursive" | "semantic" | "sentence_window"
    Called by the ingestion pipeline — swap strategy via CHUNK_STRATEGY in .env
    """
    strategies = {
        "recursive": chunk_recursive,
        "semantic": chunk_semantic,
        "sentence_window": chunk_sentence_window,
    }
    if strategy not in strategies:
        logger.warning(f"Unknown strategy '{strategy}', falling back to recursive")
        return chunk_recursive
    return strategies[strategy]
