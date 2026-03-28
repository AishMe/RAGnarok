import logging
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.models import HealthResponse, IngestResponse, QueryRequest, QueryResponse
from config.settings import settings
from ingestion.pipeline import run_ingestion
from ingestion.vector_store import collection_stats

logger = logging.getLogger(__name__)

# chains initialised in lifespan — not at import time
_rag = None
_memory_chain = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _rag, _memory_chain
    logger.info("Loading RAG chains...")
    from generation.memory_chain import get_conversational_rag_chain
    from generation.rag_chain import get_rag_chain_with_sources

    _rag = get_rag_chain_with_sources(k=4)
    _memory_chain = get_conversational_rag_chain()
    logger.info("RAG chains ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(title="RAGnarok API", version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        env=settings.app_env,
    )


@app.post("/api/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    try:
        if request.use_memory:

            answer = _memory_chain.invoke(
                {"question": request.question},
                config={"configurable": {"session_id": request.session_id}},
            )
            return QueryResponse(
                answer=answer,
                has_answer=True,
                sources=[],
                session_id=request.session_id,
            )
        else:
            result = _rag(request.question)
            return QueryResponse(
                answer=result["answer"],
                has_answer=result["has_answer"],
                sources=result["sources"],
                session_id=request.session_id,
            )
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query/session/clear")
async def clear_chat_session(session_id: str = "default"):
    from generation.memory_chain import clear_session

    clear_session(session_id)
    return {"status": "cleared", "session_id": session_id}


@app.post("/api/ingest/pdf", response_model=IngestResponse)
async def ingest_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            dest = Path(tmpdir) / file.filename
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)
            results = run_ingestion(pdf_folder=tmpdir)
        stats = collection_stats()
        return IngestResponse(
            status="ok",
            results=[
                {
                    "source": r.source,
                    "docs_loaded": r.docs_loaded,
                    "chunks_added": r.chunks_added,
                    "errors": r.errors,
                }
                for r in results
            ],
            total_chunks=stats["total_chunks"],
        )
    except Exception as e:
        logger.error(f"Ingest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest/url", response_model=IngestResponse)
async def ingest_url(url: str):
    try:
        results = run_ingestion(urls=[url])
        stats = collection_stats()
        return IngestResponse(
            status="ok",
            results=[
                {
                    "source": r.source,
                    "docs_loaded": r.docs_loaded,
                    "chunks_added": r.chunks_added,
                    "errors": r.errors,
                }
                for r in results
            ],
            total_chunks=stats["total_chunks"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def stats():
    from ingestion.cache import cache_stats

    return {**collection_stats(), **cache_stats()}
