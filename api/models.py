from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    session_id: str = "default"
    k: int = 4
    use_memory: bool = False
    doc_filter: Optional[list[str]] = None  # source values to restrict retrieval to
    username: Optional[str] = None  # scopes ChromaDB search to this user only


class SourceItem(BaseModel):
    index: int
    filename: str
    page: int | str
    score: float
    preview: str
    source_url: str | None = None
    doc_type: str


class QueryResponse(BaseModel):
    answer: str
    has_answer: bool
    sources: list[SourceItem]
    session_id: str
    from_cache: bool = False


class IngestResponse(BaseModel):
    status: str
    results: list[dict]
    total_chunks: int


class HealthResponse(BaseModel):
    status: str
    version: str
    env: str


class DocEntry(BaseModel):
    id: str
    name: str
    original_name: str
    type: str  # "pdf" | "url" | "youtube"
    source: str
    chunks: int
    added_at: datetime


class DocEntryCreate(BaseModel):
    id: str
    name: str
    original_name: str
    type: str
    source: str
    chunks: int
    added_at: datetime


class DocEntryRename(BaseModel):
    name: str
