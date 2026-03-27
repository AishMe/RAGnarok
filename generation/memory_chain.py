import logging

from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableLambda
from langchain_core.runnables.history import RunnableWithMessageHistory

from generation.llm import get_llm
from generation.rag_chain import format_docs
from ingestion.vector_store import similarity_search

logger = logging.getLogger(__name__)

# in-memory store: session_id → ChatMessageHistory
_session_store: dict[str, ChatMessageHistory] = {}


def get_session_history(session_id: str) -> BaseChatMessageHistory:
    """Returns (or creates) the message history for a session."""
    if session_id not in _session_store:
        _session_store[session_id] = ChatMessageHistory()
    return _session_store[session_id]


def get_conversational_rag_chain():
    """
    RAG chain that remembers previous turns in the conversation.

    Two prompt stages:
    1. Condense: rewrite the user's question using chat history
       so it makes sense standalone (e.g. "what about the second point?"
       becomes "what is the second point about personal finance budgeting?")
    2. Answer: use condensed question to retrieve + answer with context

    This two-step approach is the standard production pattern —
    single-step history injection into retrieval causes poor search results
    because the retriever sees raw conversational text not a clean query.
    """
    llm = get_llm()

    # Step 1: condense question using history
    condense_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """Given the chat history and a follow-up question, \
rewrite the follow-up question to be a standalone question that captures \
all necessary context. Return ONLY the rewritten question, nothing else.""",
            ),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{question}"),
        ]
    )
    condense_chain = condense_prompt | llm | StrOutputParser()

    # Step 2: answer with retrieved context
    answer_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a helpful assistant. Answer using ONLY the context below.
If the answer is not in the context, say "I don't have enough information to answer that."

Context:
{context}""",
            ),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{question}"),
        ]
    )

    def run_with_history(inputs: dict) -> str:
        history = inputs.get("chat_history", [])
        question = inputs["question"]

        # condense only if there's history
        if history:
            standalone = condense_chain.invoke(
                {
                    "chat_history": history,
                    "question": question,
                }
            )
            logger.debug(f"Condensed: '{question}' → '{standalone}'")
        else:
            standalone = question

        # retrieve using condensed question
        docs = similarity_search(standalone, k=4)
        context = format_docs(docs)

        # generate answer
        answer = (answer_prompt | llm | StrOutputParser()).invoke(
            {
                "chat_history": history,
                "question": standalone,
                "context": context,
            }
        )
        return answer

    runnable = RunnableLambda(run_with_history)

    chain_with_history = RunnableWithMessageHistory(
        runnable,
        get_session_history,
        input_messages_key="question",
        history_messages_key="chat_history",
    )

    return chain_with_history


def clear_session(session_id: str):
    """Clear a session's history — called on new conversation."""
    if session_id in _session_store:
        del _session_store[session_id]
