from dataclasses import dataclass

from langchain_core.documents import Document


@dataclass
class Citation:
    index: int
    filename: str
    page: int | str
    score: float
    preview: str
    source_url: str | None
    doc_type: str


@dataclass
class RAGResponse:
    answer: str
    citations: list[Citation]
    has_answer: bool  # False if LLM said it doesn't know


NO_ANSWER_PHRASES = [
    "don't have enough information",
    "i don't have",
    "not in the context",
    "cannot answer",
    "no information",
    "don't know",
    "cannot find",
]


def build_citations(docs: list[Document]) -> list[Citation]:
    """Converts retrieved Documents into clean Citation objects."""
    citations = []
    for i, doc in enumerate(docs, 1):
        m = doc.metadata
        # web docs have source URL, PDFs have filename+page
        is_web = m.get("doc_type") == "web"
        citations.append(
            Citation(
                index=i,
                filename=m.get("filename", "unknown") if not is_web else "web",
                page=m.get("page", "?") if not is_web else "?",
                score=round(float(m.get("similarity_score", 0)), 4),
                preview=doc.page_content[:200].replace("\n", " "),
                source_url=m.get("source") if is_web else None,
                doc_type=m.get("doc_type", "unknown"),
            )
        )
    return citations


def format_answer_with_citations(answer: str, citations: list[Citation]) -> str:
    """
    Appends a formatted sources section to the answer.
    Used in the terminal/API response.
    """
    has_answer = not any(p in answer.lower() for p in NO_ANSWER_PHRASES)
    if not has_answer or not citations:
        return answer

    sources_text = "\n\n---\n**Sources:**\n"
    for c in citations:
        if c.doc_type == "web":
            sources_text += f"[{c.index}] {c.source_url}\n"
        else:
            sources_text += (
                f"[{c.index}] {c.filename} — page {c.page} (score: {c.score})\n"
            )
    return answer + sources_text


def build_rag_response(
    answer: str,
    docs: list[Document],
) -> RAGResponse:
    """Master function — builds the complete structured RAG response."""
    citations = build_citations(docs)
    has_answer = not any(p in answer.lower() for p in NO_ANSWER_PHRASES)
    return RAGResponse(
        answer=answer,
        citations=citations,
        has_answer=has_answer,
    )
