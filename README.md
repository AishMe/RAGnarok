# RAGnarok 🔱

A production-grade Retrieval-Augmented Generation (RAG) system. Index your PDFs, web articles and YouTube videos, then chat with them using an LLM — with full source citations, per-user isolation, and a clean dark UI.

---

## Features

- **Multi-source ingestion** — PDFs, web URLs, YouTube transcripts (manual + auto-generated captions)
- **Per-user isolation** — every chunk is tagged with the owner's username; queries are scoped so users never see each other's data
- **Document filtering** — select specific documents per query; the RAG model only searches those
- **Source citations** — up to 4 deduplicated citations per answer, linking back to the original source
- **Redis caching** — repeated queries are cached per user and doc selection for instant responses
- **30-day account expiry** — inactive accounts and their indexed chunks are automatically purged
- **Username-only auth** — no passwords; accounts are named sessions backed by Redis
- **Dark UI** — ChatGPT-style interface with fixed sidebar, drag-and-drop upload, progress bars, copy buttons, and a storage indicator

---

## Architecture

```
Browser
  │
  ▼
Nginx :80
  ├── /api/*  →  FastAPI :8000
  └──  /*     →  Next.js :3000
              │
              ├── ChromaDB  (vector store)
              ├── Redis     (cache + user registry)
              └── HuggingFace all-MiniLM-L6-v2  (embeddings)
                            │
                            └── OpenRouter  (LLM — any model)
```

### Services (docker-compose)

| Service | Image | Role |
|---|---|---|
| `api` | Custom (Python 3.11) | FastAPI RAG backend |
| `frontend` | Custom (Node 20) | Next.js chat UI |
| `chroma` | `chromadb/chroma:latest` | Vector store |
| `redis` | `redis:7-alpine` | Cache + user data |
| `nginx` | `nginx:1.27-alpine` | Reverse proxy (prod profile) |

---

## Tech Stack

**Backend**
- Python 3.11, FastAPI, Uvicorn
- LangChain (LCEL chains, retrievers, memory)
- ChromaDB (vector store with metadata filtering)
- HuggingFace `sentence-transformers/all-MiniLM-L6-v2` (embeddings)
- OpenRouter (LLM gateway — swap models via `.env`)
- Redis (query cache, user doc registry, session management)
- `youtube-transcript-api` (YouTube transcript fetching)
- PyMuPDF (PDF loading)

**Frontend**
- Next.js 16, React 19, TypeScript
- `react-markdown` for rendered answers
- Inline CSS — no external UI lib dependency
- DM Sans font

**Infrastructure**
- Docker + Docker Compose
- Nginx reverse proxy
- Railway (backend deployment)
- Vercel (frontend deployment)

---

## Quick Start

### Prerequisites
- Docker Desktop
- OpenRouter API key → [openrouter.ai](https://openrouter.ai)

### 1. Clone and configure

```bash
git clone https://github.com/your-username/ragnarok.git
cd ragnarok
cp .env.example .env
# Edit .env — set OPENROUTER_API_KEY at minimum
```

### 2. Start the stack

```bash
docker compose up --build
```

First run downloads the embedding model (~80MB) — wait for:
```
INFO: RAG chains ready.
INFO: Application startup complete.
```

### 3. Open the app

| URL | Service |
|---|---|
| http://localhost:3000 | Chat UI |
| http://localhost:8000/docs | API docs (Swagger) |
| http://localhost:8001 | ChromaDB (direct) |

### 4. Production mode (with nginx)

```bash
docker compose --profile prod up --build
# Everything through http://localhost/
```

---

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

```bash
# Required
OPENROUTER_API_KEY=sk-or-...

# LLM model (any OpenRouter model string)
LLM_MODEL=meta-llama/llama-4-scout:free

# Embeddings
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_DEVICE=cpu

# Services (set automatically in Docker)
CHROMA_HOST=chroma
CHROMA_PORT=8000
REDIS_URL=redis://redis:6379/0

# App
APP_ENV=production
LLM_TEMPERATURE=0.1

# Chunking
CHUNK_STRATEGY=recursive   # recursive | semantic | sentence_window
CHUNK_SIZE=512
CHUNK_OVERLAP=64

# LangSmith tracing (optional)
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=ragnarok
```

---

## API Reference

### Health & Stats

```
GET  /api/health                    → {"status":"ok","version":"0.1.0","env":"..."}
GET  /api/stats                     → global chunk count + cache stats
GET  /api/stats/user/{username}     → chunk count for a specific user
```

### Query

```
POST /api/query
{
  "question": "What is RAG?",
  "session_id": "abc123",
  "username": "cosmicPanda",         // scopes search to this user's chunks
  "doc_filter": ["report.pdf"],      // optional — restrict to specific docs
  "k": 4,
  "use_memory": false
}
```

### Ingest

```
POST /api/ingest/pdf?username=alice          (multipart, file=...)
POST /api/ingest/url?url=https://...&username=alice
POST /api/ingest/youtube?url=https://youtu.be/...&username=alice
```

### User Document Registry

```
GET    /api/users/{username}/docs            → list all docs for user
POST   /api/users/{username}/docs            → register a doc
PATCH  /api/users/{username}/docs/{id}       → rename
DELETE /api/users/{username}/docs/{id}       → remove from registry
```

### Username Suggestions

```
GET /api/usernames/suggest   → {"username":"cosmicPanda"}
```

---

## Project Structure

```
ragnarok/
├── api/
│   ├── main.py          # FastAPI app, all endpoints
│   └── models.py        # Pydantic request/response models
├── config/
│   └── settings.py      # Pydantic settings (reads .env)
├── generation/
│   ├── chain.py         # Basic QA chain
│   ├── citations.py     # Source citation builder
│   ├── llm.py           # LLM factory (OpenRouter)
│   ├── memory_chain.py  # Conversational RAG with history
│   └── rag_chain.py     # RAG chain with sources + user isolation
├── ingestion/
│   ├── cache.py         # Redis query cache
│   ├── chunker.py       # Chunking strategies (recursive/semantic/window)
│   ├── embeddings.py    # HuggingFace embedding model
│   ├── loaders.py       # PDF, URL, SQL, JSON loaders
│   ├── pipeline.py      # Master ingestion pipeline (tags username)
│   └── vector_store.py  # ChromaDB wrapper (add, search, delete by user)
├── frontend/
│   ├── app/
│   │   ├── page.tsx     # Main chat + sidebar UI
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/ui/   # shadcn/ui components
│   ├── Dockerfile       # Multi-stage Next.js build
│   └── vercel.json      # Vercel deployment config
├── scripts/             # Dev/test scripts
├── nginx/
│   └── nginx.conf       # Reverse proxy config
├── Dockerfile           # API container
├── docker-compose.yml   # Full stack orchestration
├── railway.toml         # Railway deployment config
└── pyproject.toml       # Python dependencies
```

---

## Deployment

### Backend → Railway

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub repo
3. Add Redis plugin (auto-injects `REDIS_URL`)
4. Add ChromaDB service: Docker image `chromadb/chroma:latest`
5. Set env vars: `OPENROUTER_API_KEY`, `CHROMA_HOST`, `CHROMA_PORT=8000`, `APP_ENV=production`
6. Set port to `8080` (Railway default)

### Frontend → Vercel

1. Vercel → New Project → Import repo
2. Set Root Directory: `frontend`
3. Set env var: `NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app`
4. Deploy

---

## How It Works

### Ingestion pipeline

```
Document (PDF / URL / YouTube)
  → Load (PyMuPDF / WebBaseLoader / youtube-transcript-api)
  → Chunk (RecursiveCharacterTextSplitter, 512 chars, 64 overlap)
  → Tag metadata (username, doc_hash, filename, source, page)
  → Embed (all-MiniLM-L6-v2 → 384-dim vectors)
  → Store (ChromaDB with deduplication by doc_hash)
  → Register (Redis user doc list)
```

### Query pipeline

```
User question
  → Build ChromaDB filter: {username: X} ∩ {source: selected_docs}
  → Similarity search (MMR, k=4)
  → Format context from retrieved chunks
  → LLM prompt: "Answer using ONLY this context"
  → Deduplicate citations (max 4, unique by source+page)
  → Cache result in Redis (keyed by question + username + doc_filter)
  → Return answer + sources
```

### User isolation

Every chunk stored in ChromaDB has `username` in its metadata. Every query adds `{"username": {"$eq": username}}` to the ChromaDB `where` filter before searching. Users can only retrieve their own chunks.

### 30-day expiry

On startup, `_purge_expired_users()` checks every user's `last_seen` timestamp in Redis. Users inactive for 30+ days have their chunks deleted from ChromaDB (by metadata filter), their doc list removed from Redis, and their record deleted. Every API call updates `last_seen`.

---

## Chunking Strategies

Set via `CHUNK_STRATEGY` in `.env`:

| Strategy | Description | Best for |
|---|---|---|
| `recursive` | Splits on paragraphs → sentences → words (default) | Most documents |
| `semantic` | Splits at semantic boundaries using embeddings | High-quality retrieval, slow ingestion |
| `sentence_window` | Small chunks with surrounding context window | Precise search + rich context |

---

## Development

```bash
# Start backend services only
docker compose up chroma redis -d

# Run API locally
pip install -e ".[dev]"
uvicorn api.main:app --reload

# Run frontend locally
cd frontend && npm install && npm run dev

# Ingest documents
python scripts/ingest.py --pdf data/sample/
python scripts/ingest.py --urls https://en.wikipedia.org/wiki/Retrieval-augmented_generation

# Run test scripts
python scripts/test_rag.py
python scripts/test_citations.py
python scripts/test_memory.py
```

---

## Roadmap

This is v1 — a working, deployed RAG system. Coming next (Days 15–30):

- [ ] **RAGAS evaluation** — automated quality scoring on every PR
- [ ] **Streaming responses** — token-by-token SSE output
- [ ] **Re-ranking** — cross-encoder reranker after retrieval
- [ ] **HyDE** — hypothetical document embeddings for better retrieval
- [ ] **Query expansion** — multi-query retrieval
- [ ] **Async ingestion** — Celery workers for large document processing
- [ ] **pgvector** — PostgreSQL as alternative vector store
- [ ] **Observability** — Prometheus + Grafana dashboards

---

## License

MIT