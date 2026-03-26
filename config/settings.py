from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenRouter / LLM
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "meta-llama/llama-3.1-8b-instruct:free"
    llm_temperature: float = 0.1

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"

    # ChromaDB
    chroma_host: str = "chroma"
    chroma_port: int = 8000

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # LangSmith (optional)
    langchain_tracing_v2: str = "false"
    langchain_api_key: str = ""
    langchain_project: str = "ragnarok"

    # App
    app_env: str = "development"
    app_version: str = "0.1.0"


settings = Settings()
