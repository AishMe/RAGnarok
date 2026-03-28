from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    session_id: str = "default"
    k: int = 4
    use_memory: bool = False


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
