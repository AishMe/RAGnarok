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
    has_answer: bool


NO_ANSWER_PHRASES = [
    "don't have enough information",
    "i don't have",
    "not in the context",
    "cannot answer",
    "no information",
    "don't know",
    "cannot find",
]

# Doc types that have a linkable source URL
WEB_LIKE_TYPES = {"web", "youtube", "api"}


def build_citations(docs: list[Document]) -> list[Citation]:
    """Converts retrieved Documents into clean Citation objects."""
    citations = []
    for i, doc in enumerate(docs, 1):
        m = doc.metadata
        doc_type = m.get("doc_type", "unknown")
        is_web_like = doc_type in WEB_LIKE_TYPES

        # Resolve the best available URL:
        # 1. explicit source_url field
        # 2. source field (used by YouTube / JSON loader)
        # 3. None
        raw_url = m.get("source_url") or m.get("source")
        source_url: str | None = None
        if is_web_like and raw_url:
            try:
                from urllib.parse import urlparse

                parsed = urlparse(raw_url)
                # Only accept if it looks like a real HTTP(S) URL
                if parsed.scheme in ("http", "https") and parsed.netloc:
                    source_url = raw_url
            except Exception:
                pass

        # For YouTube, use the video title stored in metadata as the filename
        # so the citation shows the video name instead of "unknown"
        if doc_type == "youtube":
            filename = m.get("title") or m.get("video_id") or "YouTube"
        else:
            filename = m.get("filename", "unknown") if not is_web_like else "web"

        citations.append(
            Citation(
                index=i,
                filename=filename,
                page=m.get("page", "?") if not is_web_like else "?",
                score=round(float(m.get("similarity_score", 0)), 4),
                preview=doc.page_content[:200].replace("\n", " "),
                source_url=source_url,
                doc_type=doc_type,
            )
        )
    return citations


def format_answer_with_citations(answer: str, citations: list[Citation]) -> str:
    has_answer = not any(p in answer.lower() for p in NO_ANSWER_PHRASES)
    if not has_answer or not citations:
        return answer

    sources_text = "\n\n---\n**Sources:**\n"
    for c in citations:
        if c.source_url:
            sources_text += f"[{c.index}] {c.filename} — {c.source_url}\n"
        else:
            sources_text += (
                f"[{c.index}] {c.filename} — page {c.page} (score: {c.score})\n"
            )
    return answer + sources_text


def build_rag_response(answer: str, docs: list[Document]) -> RAGResponse:
    citations = build_citations(docs)
    has_answer = not any(p in answer.lower() for p in NO_ANSWER_PHRASES)
    return RAGResponse(answer=answer, citations=citations, has_answer=has_answer)
