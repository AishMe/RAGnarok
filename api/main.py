import json
import logging
import re
import shutil
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import redis as redis_lib
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.models import (
    DocEntry,
    DocEntryCreate,
    DocEntryRename,
    HealthResponse,
    IngestResponse,
    QueryRequest,
    QueryResponse,
)
from config.settings import settings
from ingestion.pipeline import run_ingestion
from ingestion.vector_store import (
    collection_stats,
    delete_by_username,
    user_chunk_count,
)

logger = logging.getLogger(__name__)

_rag = None
_memory_chain = None

USER_EXPIRY_DAYS = 30
RAGNAROK_USERS_KEY = "ragnarok:users"
USER_DOCS_PREFIX = "ragnarok:user:"


# ── Helpers ───────────────────────────────────────────────────────────────────


def _redis() -> redis_lib.Redis:
    return redis_lib.from_url(settings.redis_url, decode_responses=True)


def _user_docs_key(username: str) -> str:
    return f"{USER_DOCS_PREFIX}{username}:docs"


def _touch_user(username: str):
    try:
        r = _redis()
        r.hset(RAGNAROK_USERS_KEY, username, datetime.now(timezone.utc).isoformat())
    except Exception as e:
        logger.warning(f"Failed to touch user {username}: {e}")


def _purge_expired_users():
    try:
        r = _redis()
        all_users = r.hgetall(RAGNAROK_USERS_KEY)
        cutoff = datetime.now(timezone.utc) - timedelta(days=USER_EXPIRY_DAYS)
        for username, last_seen_str in all_users.items():
            try:
                last_seen = datetime.fromisoformat(last_seen_str)
                if last_seen < cutoff:
                    logger.info(f"Purging expired user '{username}'")
                    deleted = delete_by_username(username)
                    r.delete(_user_docs_key(username))
                    r.hdel(RAGNAROK_USERS_KEY, username)
                    logger.info(f"Purged '{username}': {deleted} chunks deleted")
            except Exception as e:
                logger.warning(f"Error purging user {username}: {e}")
    except Exception as e:
        logger.warning(f"User expiry check failed: {e}")


# ── YouTube helpers ───────────────────────────────────────────────────────────


def _extract_video_id(url: str) -> str | None:
    patterns = [r"(?:v=|/v/|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})"]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


def _fetch_youtube_title(video_id: str) -> str:
    """Fetch video title via oEmbed API — no API key needed."""
    try:
        import urllib.request

        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(oembed_url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return data.get("title", f"YouTube: {video_id}")
    except Exception:
        return f"YouTube: {video_id}"


def _fetch_youtube_transcript(video_id: str) -> tuple[str, str]:
    """
    Fetch transcript for a YouTube video.
    Returns (transcript_text, title).
    Falls back to auto-generated captions if manual not available.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        ytt_api = YouTubeTranscriptApi()

        # List available transcripts
        transcripts = ytt_api.list(video_id)

        # Prefer English if available
        transcript = None
        for t in transcripts:
            if t.language_code == "en":
                transcript = t
                break

        # Fallback to first available transcript
        if transcript is None:
            transcript = transcripts[0]

        entries = ytt_api.fetch(video_id)
        text = " ".join(entry.text for entry in entries)

        # Fetch real title via oEmbed
        title = _fetch_youtube_title(video_id)
        return text, title

    except Exception as e:
        raise ValueError(f"Could not fetch transcript: {e}")


# ── Lifespan ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _rag, _memory_chain
    logger.info("Checking for expired users...")
    _purge_expired_users()
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


# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok", version=settings.app_version, env=settings.app_env
    )


# ── Query ─────────────────────────────────────────────────────────────────────


@app.post("/api/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    if request.username:
        _touch_user(request.username)
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
            result = _rag(
                request.question,
                username=request.username,
                doc_filter=request.doc_filter,
            )
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


# ── Ingest: PDF ───────────────────────────────────────────────────────────────


@app.post("/api/ingest/pdf", response_model=IngestResponse)
async def ingest_pdf(file: UploadFile = File(...), username: str | None = None):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")
    if username:
        _touch_user(username)
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            dest = Path(tmpdir) / file.filename
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)
            results = run_ingestion(pdf_folder=tmpdir, username=username)
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
        logger.error(f"PDF ingest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Ingest: URL ───────────────────────────────────────────────────────────────


@app.post("/api/ingest/url", response_model=IngestResponse)
async def ingest_url(url: str, username: str | None = None):
    if username:
        _touch_user(username)
    try:
        results = run_ingestion(urls=[url], username=username)
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


# ── Ingest: YouTube ───────────────────────────────────────────────────────────


@app.post("/api/ingest/youtube")
async def ingest_youtube(url: str, username: str | None = None):
    """
    Fetch a YouTube video transcript and index it.
    Returns chunks_added and the video title (for the frontend to use as doc name).
    """
    if username:
        _touch_user(username)

    video_id = _extract_video_id(url)
    if not video_id:
        raise HTTPException(
            status_code=400,
            detail="Could not extract video ID. Use a valid YouTube URL.",
        )

    try:
        transcript_text, title = _fetch_youtube_transcript(video_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    records = [
        {
            "content": transcript_text,
            "title": title,
            "video_id": video_id,
            "source": url,  # use the video URL as source so citation links back to YouTube
            "doc_type": "youtube",
        }
    ]

    try:
        results = run_ingestion(
            json_records=records,
            json_content_key="content",
            json_metadata_keys=["title", "video_id", "source", "doc_type"],
            username=username,
        )
        stats = collection_stats()
        return {
            "status": "ok",
            "title": title,  # send title back so frontend can use it as doc name
            "video_id": video_id,
            "results": [
                {
                    "source": url,
                    "docs_loaded": r.docs_loaded,
                    "chunks_added": r.chunks_added,
                    "errors": r.errors,
                }
                for r in results
            ],
            "total_chunks": stats["total_chunks"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stats ─────────────────────────────────────────────────────────────────────


@app.get("/api/stats")
async def stats():
    from ingestion.cache import cache_stats

    return {**collection_stats(), **cache_stats()}


@app.get("/api/stats/user/{username}")
async def user_stats(username: str):
    _touch_user(username)
    count = user_chunk_count(username)
    return {"username": username, "total_chunks": count}


# ── User document registry ────────────────────────────────────────────────────


@app.get("/api/users/{username}/docs", response_model=list[DocEntry])
async def get_user_docs(username: str):
    _touch_user(username)
    try:
        r = _redis()
        raw = r.lrange(_user_docs_key(username), 0, -1)
        return [DocEntry(**json.loads(item)) for item in raw]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/users/{username}/docs", response_model=DocEntry)
async def add_user_doc(username: str, doc: DocEntryCreate):
    _touch_user(username)
    try:
        r = _redis()
        entry = DocEntry(**doc.model_dump())
        r.rpush(_user_docs_key(username), entry.model_dump_json())
        return entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/users/{username}/docs/{doc_id}", response_model=DocEntry)
async def rename_user_doc(username: str, doc_id: str, body: DocEntryRename):
    _touch_user(username)
    try:
        r = _redis()
        key = _user_docs_key(username)
        raw = r.lrange(key, 0, -1)
        updated = None
        new_list = []
        for item in raw:
            entry = DocEntry(**json.loads(item))
            if entry.id == doc_id:
                entry.name = body.name
                updated = entry
            new_list.append(entry.model_dump_json())
        if not updated:
            raise HTTPException(status_code=404, detail="Doc not found")
        pipe = r.pipeline()
        pipe.delete(key)
        for item in new_list:
            pipe.rpush(key, item)
        pipe.execute()
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/users/{username}/docs/{doc_id}")
async def delete_user_doc(username: str, doc_id: str):
    _touch_user(username)
    try:
        r = _redis()
        key = _user_docs_key(username)
        raw = r.lrange(key, 0, -1)
        new_list = [item for item in raw if json.loads(item).get("id") != doc_id]
        if len(new_list) == len(raw):
            raise HTTPException(status_code=404, detail="Doc not found")
        pipe = r.pipeline()
        pipe.delete(key)
        for item in new_list:
            pipe.rpush(key, item)
        pipe.execute()
        return {"status": "deleted", "id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Username suggestions ──────────────────────────────────────────────────────


@app.get("/api/usernames/suggest")
async def suggest_usernames():
    """
    Return a random fun username that isn't already registered.
    Uses adjective + noun combos — no external deps.
    """
    import random

    adjectives = [
        "cosmic",
        "fuzzy",
        "silent",
        "blazing",
        "neon",
        "turbo",
        "phantom",
        "solar",
        "arctic",
        "crimson",
        "golden",
        "silver",
        "shadow",
        "thunder",
        "electric",
        "frozen",
        "ancient",
        "digital",
        "quantum",
        "stealth",
    ]
    nouns = [
        "panda",
        "falcon",
        "wizard",
        "ninja",
        "rocket",
        "dragon",
        "cipher",
        "vector",
        "pixel",
        "quasar",
        "comet",
        "nebula",
        "spark",
        "blade",
        "storm",
        "titan",
        "raven",
        "phoenix",
        "cobra",
        "wolf",
    ]
    try:
        r = _redis()
        existing = set(r.hkeys(RAGNAROK_USERS_KEY))
    except Exception:
        existing = set()

    random.shuffle(adjectives)
    random.shuffle(nouns)
    for adj in adjectives:
        for noun in nouns:
            candidate = f"{adj}{noun.capitalize()}"
            if candidate not in existing:
                return {"username": candidate}

    # All combos taken — add a number suffix
    import time

    return {
        "username": f"{random.choice(adjectives)}{random.choice(nouns).capitalize()}{int(time.time()) % 1000}"
    }
