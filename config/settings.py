from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenRouter / LLM
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "meta-llama/llama-4-scout:free"
    llm_temperature: float = 0.1

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_device: str = "cpu"
    embedding_cache_folder: str = ".cache/models"

    # ChromaDB
    # chroma_host: str = "chroma"
    # chroma_port: int = 8000

    chroma_host: str = "localhost"  # default for local scripts
    chroma_port: int = 8001  # external port (your Mac → Docker)

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # LangSmith
    langchain_tracing_v2: str = "true"
    langchain_api_key: str = ""
    langchain_project: str = "ragnarok"

    chunk_strategy: str = "recursive"
    chunk_size: int = 512
    chunk_overlap: int = 64

    # App
    app_env: str = "development"
    app_version: str = "0.1.0"


settings = Settings()
