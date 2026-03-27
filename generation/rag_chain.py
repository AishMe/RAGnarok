import logging

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
    """Joins retrieved chunks into a single context string for the prompt."""
    return "\n\n---\n\n".join(
        f"[Source: {d.metadata.get('filename','unknown')} "
        f"p.{d.metadata.get('page','?')}]\n{d.page_content}"
        for d in docs
    )


def get_rag_chain(k: int = 4):
    """
    Full RAG chain:
      1. retriever fetches top-k relevant chunks
      2. format_docs joins them into context string
      3. prompt fills in context + question
      4. llm generates answer
      5. parser extracts plain text

    RunnableParallel runs retriever and passthrough simultaneously —
    retriever gets the question, passthrough passes the question through unchanged.
    Both outputs feed into the prompt as {context} and {question}.
    """
    retriever = get_retriever(k=k)
    llm = get_llm()
    parser = StrOutputParser()

    rag_chain = (
        RunnableParallel(
            {
                "context": retriever | format_docs,
                "question": RunnablePassthrough(),
            }
        )
        | RAG_PROMPT
        | llm
        | parser
    )
    return rag_chain


def get_rag_chain_with_sources(k: int = 4):
    """
    Same as get_rag_chain but also returns the source documents.
    Returns dict: {"answer": str, "sources": list[Document]}
    Used by FastAPI on Day 11 to return citations.
    """
    llm = get_llm()
    parser = StrOutputParser()

    answer_chain = RAG_PROMPT | llm | parser

    def run(question: str) -> dict:
        from ingestion.vector_store import similarity_search

        retrieved = similarity_search(question, k=4)
        context = format_docs(retrieved)
        answer = answer_chain.invoke(
            {
                "context": context,
                "question": question,
            }
        )
        return {
            "answer": answer,
            "sources": [
                {
                    "filename": d.metadata.get("filename", "unknown"),
                    "page": d.metadata.get("page", "?"),
                    "score": d.metadata.get("similarity_score", 0),
                    "preview": d.page_content[:200],
                }
                for d in retrieved
            ],
        }

    return run
