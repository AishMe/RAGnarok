from langchain_huggingface import HuggingFaceEmbeddings

from config.settings import settings


def get_embeddings() -> HuggingFaceEmbeddings:
    """
    Returns a configured embedding model.

    all-MiniLM-L6-v2 facts:
    - Size:       80MB download, free forever
    - Output:     384-dimensional vector per sentence
    - Speed:      ~2000 sentences/second on CPU
    - Quality:    Great for English, decent for other languages
    - LangChain:  Drop-in compatible with ChromaDB, Pinecone, pgvector
    """
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model,
        model_kwargs={"device": settings.embedding_device},
        encode_kwargs={
            "normalize_embeddings": True,
            "batch_size": 32,
        },
        cache_folder=settings.embedding_cache_folder,
    )
