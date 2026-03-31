import logging

from langchain_chroma import Chroma
from langchain_core.documents import Document

from config.settings import settings
from ingestion.embeddings import get_embeddings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "ragnarok"


def get_vector_store() -> Chroma:
    import chromadb

    client = chromadb.HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
    )
    return Chroma(
        client=client,
        collection_name=COLLECTION_NAME,
        embedding_function=get_embeddings(),
    )


def add_documents(docs: list[Document]) -> int:
    """
    Embeds and stores documents. Deduplicates by doc_hash.
    Documents should have 'username' in metadata before calling this.
    """
    if not docs:
        return 0

    store = get_vector_store()
    try:
        existing = store.get(include=["metadatas"])
        existing_hashes = {
            m.get("doc_hash") for m in existing["metadatas"] if m.get("doc_hash")
        }
    except Exception:
        existing_hashes = set()

    new_docs = [d for d in docs if d.metadata.get("doc_hash") not in existing_hashes]
    if not new_docs:
        logger.info("All documents already indexed — nothing to add")
        return 0

    logger.info(
        f"Adding {len(new_docs)} new docs ({len(docs) - len(new_docs)} duplicates skipped)"
    )
    store.add_documents(new_docs)
    return len(new_docs)


def similarity_search(
    query: str,
    k: int = 4,
    where: dict | None = None,
) -> list[Document]:
    """
    Search for the k most similar chunks.
    where: ChromaDB metadata filter. Always include username filter when available.
    """
    store = get_vector_store()

    if where:
        results = store.similarity_search_with_relevance_scores(
            query, k=k, filter=where
        )
    else:
        results = store.similarity_search_with_relevance_scores(query, k=k)

    docs = []
    for doc, score in results:
        doc.metadata["similarity_score"] = round(max(score, 0.0), 4)
        docs.append(doc)
    return docs


def delete_by_username(username: str) -> int:
    """
    Delete all chunks belonging to a user from ChromaDB.
    Called when a user account expires (30-day inactivity).
    Returns number of chunks deleted.
    """
    import chromadb

    client = chromadb.HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
    )
    collection = client.get_or_create_collection(COLLECTION_NAME)

    # Get all IDs for this user
    result = collection.get(where={"username": {"$eq": username}})
    ids = result.get("ids", [])

    if not ids:
        logger.info(f"No chunks found for user '{username}'")
        return 0

    # ChromaDB delete accepts a list of IDs
    collection.delete(ids=ids)
    logger.info(f"Deleted {len(ids)} chunks for expired user '{username}'")
    return len(ids)


def get_retriever(k: int = 4):
    store = get_vector_store()
    return store.as_retriever(
        search_type="mmr",
        search_kwargs={"k": k, "fetch_k": k * 3},
    )


def collection_stats() -> dict:
    store = get_vector_store()
    count = store._collection.count()
    return {"collection": COLLECTION_NAME, "total_chunks": count}


def user_chunk_count(username: str) -> int:
    """Count how many chunks belong to a specific user."""
    import chromadb

    client = chromadb.HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
    )
    collection = client.get_or_create_collection(COLLECTION_NAME)
    result = collection.get(where={"username": {"$eq": username}})
    return len(result.get("ids", []))
