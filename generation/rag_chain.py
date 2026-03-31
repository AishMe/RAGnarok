import logging
from typing import Optional

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough

from generation.llm import get_llm
from ingestion.vector_store import get_retriever

logger = logging.getLogger(__name__)

RAG_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a helpful assistant. Answer the user's question using ONLY \
the context provided below. If the answer is not in the context, say \
"I don't have enough information to answer that."

Context:
{context}""",
        ),
        ("human", "{question}"),
    ]
)


def format_docs(docs: list[Document]) -> str:
    return "\n\n---\n\n".join(
        f"[Source: {d.metadata.get('filename', 'unknown')} "
        f"p.{d.metadata.get('page', '?')}]\n{d.page_content}"
        for d in docs
    )


def get_rag_chain(k: int = 4):
    retriever = get_retriever(k=k)
    llm = get_llm()
    parser = StrOutputParser()
    rag_chain = (
        RunnableParallel(
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
        )
        | RAG_PROMPT
        | llm
        | parser
    )
    return rag_chain


def _build_where_filter(
    username: Optional[str],
    doc_filter: Optional[list[str]],
) -> Optional[dict]:
    """
    Build a ChromaDB $where filter combining username isolation + doc selection.

    Logic:
    - Always scope to username if provided (isolation)
    - Additionally filter to specific sources if doc_filter provided
    - Combine with $and when both are present
    """
    username_clause = {"username": {"$eq": username}} if username else None

    if doc_filter and len(doc_filter) > 0:
        source_conditions = []
        for src in doc_filter:
            source_conditions.append({"source": {"$eq": src}})
            source_conditions.append({"filename": {"$eq": src}})
        source_clause = (
            {"$or": source_conditions}
            if len(source_conditions) > 1
            else source_conditions[0]
        )
    else:
        source_clause = None

    if username_clause and source_clause:
        return {"$and": [username_clause, source_clause]}
    elif username_clause:
        return username_clause
    elif source_clause:
        return source_clause
    return None


def get_rag_chain_with_sources(k: int = 4):
    """
    Returns a callable: run(question, username=None, doc_filter=None) -> dict

    username:   isolates search to this user's chunks only
    doc_filter: further restricts to specific source values within that user
    """
    llm = get_llm()
    parser = StrOutputParser()
    answer_chain = RAG_PROMPT | llm | parser

    from generation.citations import build_rag_response, format_answer_with_citations

    def run(
        question: str,
        username: Optional[str] = None,
        doc_filter: Optional[list[str]] = None,
    ) -> dict:
        from ingestion.cache import get_cached_query, set_cached_query
        from ingestion.vector_store import similarity_search

        # Cache key includes username + filter for proper isolation
        cache_parts = [question]
        if username:
            cache_parts.append(f"user={username}")
        if doc_filter:
            cache_parts.append(f"filter={'|'.join(sorted(doc_filter))}")
        cache_key = "::".join(cache_parts)

        cached = get_cached_query(cache_key, k=k)
        if cached:
            cached["from_cache"] = True
            return cached

        where = _build_where_filter(username, doc_filter)
        retrieved = similarity_search(question, k=k, where=where)
        context = format_docs(retrieved)
        answer = answer_chain.invoke({"context": context, "question": question})

        response = build_rag_response(answer, retrieved)

        # Deduplicate sources — max 4 unique
        seen: set[str] = set()
        unique_citations = []
        for c in response.citations:
            key = c.source_url if c.doc_type == "web" else f"{c.filename}:{c.page}"
            if key not in seen:
                seen.add(key)
                unique_citations.append(c)
            if len(unique_citations) >= 4:
                break

        result = {
            "answer": response.answer,
            "has_answer": response.has_answer,
            "from_cache": False,
            "sources": [
                {
                    "index": i + 1,
                    "filename": c.filename,
                    "page": c.page,
                    "score": c.score,
                    "preview": c.preview,
                    "source_url": c.source_url,
                    "doc_type": c.doc_type,
                }
                for i, c in enumerate(unique_citations)
            ],
            "formatted": format_answer_with_citations(
                response.answer, unique_citations
            ),
        }

        if response.has_answer:
            set_cached_query(cache_key, result, k=k)
        return result

    return run
