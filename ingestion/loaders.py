import hashlib
import logging
import os
from pathlib import Path

from langchain_community.document_loaders import (
    PyMuPDFLoader,
    SQLDatabaseLoader,
    WebBaseLoader,
)
from langchain_core.documents import Document
from sqlalchemy import create_engine

logger = logging.getLogger(__name__)

os.environ.setdefault("USER_AGENT", "RAGnarok/1.0")


# ── helpers ──────────────────────────────────────────────────────────────────


def _doc_hash(content: str, source: str) -> str:
    """Stable hash for deduplication — same content + source = same hash."""
    return hashlib.md5(f"{source}:{content[:200]}".encode()).hexdigest()


def _tag(doc: Document, extra: dict) -> Document:
    """Merge extra metadata into a document and add a content hash."""
    doc.metadata.update(extra)
    doc.metadata["doc_hash"] = _doc_hash(
        doc.page_content, doc.metadata.get("source", "")
    )
    return doc


# ── PDF loader ────────────────────────────────────────────────────────────────


def load_pdf(path: str | Path) -> list[Document]:
    """
    Load a single PDF. Returns one Document per page.
    Skips silently if file missing — never crashes the pipeline.
    """
    path = Path(path)
    if not path.exists():
        logger.warning(f"PDF not found, skipping: {path}")
        return []
    try:
        loader = PyMuPDFLoader(str(path))
        docs = loader.load()
        return [
            _tag(
                d,
                {
                    "source": str(path),
                    "filename": path.name,
                    "doc_type": "pdf",
                    "page": d.metadata.get("page", 0),
                },
            )
            for d in docs
        ]
    except Exception as e:
        logger.error(f"Failed to load PDF {path}: {e}")
        return []


def load_pdf_folder(folder: str | Path) -> list[Document]:
    """Load all PDFs in a folder. Skips corrupt files, logs errors."""
    folder = Path(folder)
    docs = []
    pdf_files = list(folder.glob("**/*.pdf"))
    logger.info(f"Found {len(pdf_files)} PDFs in {folder}")
    for pdf_path in pdf_files:
        loaded = load_pdf(pdf_path)
        docs.extend(loaded)
        logger.info(f"  Loaded {len(loaded)} pages from {pdf_path.name}")
    return docs


# ── Web loader ────────────────────────────────────────────────────────────────


def load_urls(urls: list[str]) -> list[Document]:
    """
    Load web pages. Strips HTML, returns clean text.
    Skips failed URLs — network errors won't crash the pipeline.
    """
    docs = []
    for url in urls:
        try:
            loader = WebBaseLoader(url)
            loaded = loader.load()
            docs.extend(
                [
                    _tag(
                        d,
                        {
                            "source": url,
                            "doc_type": "web",
                        },
                    )
                    for d in loaded
                ]
            )
            logger.info(f"Loaded web page: {url}")
        except Exception as e:
            logger.error(f"Failed to load URL {url}: {e}")
    return docs


# ── SQL loader ────────────────────────────────────────────────────────────────


def load_sql(
    connection_string: str,
    query: str,
    page_content_columns: list[str],
    metadata_columns: list[str] | None = None,
) -> list[Document]:
    """
    Load rows from a SQL database as Documents.
    Each row becomes one Document. page_content_columns are joined as text.

    Example:
        load_sql(
            "sqlite:///data/products.db",
            "SELECT name, description, price FROM products",
            page_content_columns=["name", "description"],
            metadata_columns=["price"],
        )
    """
    try:
        engine = create_engine(connection_string)
        loader = SQLDatabaseLoader(
            query=query,
            db=engine,
            page_content_columns=page_content_columns,
            metadata_columns=metadata_columns or [],
        )
        docs = loader.load()
        return [_tag(d, {"doc_type": "sql", "source": connection_string}) for d in docs]
    except Exception as e:
        logger.error(f"Failed to load SQL: {e}")
        return []


# ── API / JSON loader ─────────────────────────────────────────────────────────


def load_json_records(
    records: list[dict],
    content_key: str,
    metadata_keys: list[str] | None = None,
    source_name: str = "api",
) -> list[Document]:
    """
    Convert a list of dicts (from any REST API or JSON file) into Documents.
    content_key: which dict key becomes the page_content
    metadata_keys: which dict keys become metadata

    Example:
        data = requests.get("https://api.example.com/articles").json()
        docs = load_json_records(data, content_key="body", metadata_keys=["title","author"])
    """
    docs = []
    meta_keys = metadata_keys or []
    for record in records:
        content = str(record.get(content_key, ""))
        if not content.strip():
            continue
        metadata = {k: record.get(k) for k in meta_keys}
        metadata["doc_type"] = "api"
        metadata["source"] = source_name
        doc = Document(page_content=content, metadata=metadata)
        docs.append(_tag(doc, {}))
    return docs
