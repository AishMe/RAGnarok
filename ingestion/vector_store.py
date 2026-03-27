import logging

from langchain_chroma import Chroma
from langchain_core.documents import Document

from config.settings import settings
from ingestion.embeddings import get_embeddings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "ragnarok"


def get_vector_store() -> Chroma:
    """
    Returns a Chroma vector store connected to the running ChromaDB container.
    Uses HttpClient — connects to Docker service, not in-memory.
    In-memory Chroma is fine for tests but data disappears on restart.
    HttpClient persists to the chroma container's volume.
    """
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
    Embeds and stores documents in ChromaDB.
    Deduplicates by doc_hash — re-running won't create duplicates.
    Returns number of NEW documents actually added.
    """
    if not docs:
        return 0

    store = get_vector_store()

    # get hashes already in the store
    try:
        existing = store.get(include=["metadatas"])
        existing_hashes = {
            m.get("doc_hash") for m in existing["metadatas"] if m.get("doc_hash")
        }
    except Exception:
        existing_hashes = set()

    # filter to only new documents
    new_docs = [d for d in docs if d.metadata.get("doc_hash") not in existing_hashes]

    if not new_docs:
        logger.info("All documents already indexed — nothing to add")
        return 0

    logger.info(
        f"Adding {len(new_docs)} new docs ({len(docs) - len(new_docs)} duplicates skipped)"
    )
    store.add_documents(new_docs)
    return len(new_docs)


def similarity_search(query: str, k: int = 4) -> list[Document]:
    """
    Search for the k most similar chunks to the query.
    Returns Documents with similarity scores in metadata.
    """
    store = get_vector_store()
    results = store.similarity_search_with_relevance_scores(query, k=k)
    docs = []
    for doc, score in results:
        doc.metadata["similarity_score"] = round(score, 4)
        docs.append(doc)
    return docs


def get_retriever(k: int = 4):
    """
    Returns a LangChain retriever — used directly in RAG chains on Day 8.
    """
    store = get_vector_store()
    return store.as_retriever(
        search_type="mmr",  # MMR = diverse results, not just top-k similar
        search_kwargs={"k": k, "fetch_k": k * 3},
    )


def collection_stats() -> dict:
    """How many chunks are stored, useful for debugging."""
    store = get_vector_store()
    count = store._collection.count()
    return {"collection": COLLECTION_NAME, "total_chunks": count}
