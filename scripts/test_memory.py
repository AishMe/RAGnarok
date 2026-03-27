import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from generation.memory_chain import clear_session, get_conversational_rag_chain

chain = get_conversational_rag_chain()
session = "test-session-001"
clear_session(session)

questions = [
    "What is personal finance?",
    "Why is it important for students?",  # follow-up — needs history
    "What were the main points you just mentioned?",  # explicit reference to history
    "What is the capital of France?",  # out of context — should say I don't know
]

print("Conversational RAG test\n" + "=" * 50)
for q in questions:
    print(f"\nYou: {q}")
    answer = chain.invoke(
        {"question": q},
        config={"configurable": {"session_id": session}},
    )
    print(f"Bot: {answer}")
    print("-" * 40)
