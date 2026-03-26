from langchain_openai import ChatOpenAI

from config.settings import settings


def get_llm(temperature: float | None = None) -> ChatOpenAI:
    """
    Returns a configured LLM pointing at OpenRouter.
    Every chain in the project calls this — never instantiate ChatOpenAI directly.
    """
    return ChatOpenAI(
        model=settings.llm_model,
        openai_api_key=settings.openrouter_api_key,
        openai_api_base=settings.openrouter_base_url,
        temperature=(
            temperature if temperature is not None else settings.llm_temperature
        ),
        streaming=True,  # always enable — needed for .astream()
    )
