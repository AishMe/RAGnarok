from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "meta-llama/llama-3.1-8b-instruct:free"
    embedding_model: str = "all-MiniLM-L6-v2"
    chroma_host: str = "localhost"
    chroma_port: int = 8000
    redis_url: str = "redis://localhost:6379/0"
    app_env: str = "development"
    app_version: str = "0.1.0"


settings = Settings()
