from fastapi import FastAPI

from config.settings import settings

app = FastAPI(title="RAG System", version=settings.app_version)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": settings.app_version,
        "env": settings.app_env,
    }
