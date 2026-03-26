import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from generation.chain import get_qa_chain


async def test_basic_invoke():
    """Test 1: basic call — waits for full response then prints"""
    print("\n--- Test 1: Basic invoke ---")
    chain = get_qa_chain()
    response = await chain.ainvoke({"question": "What is a RAG system in 2 sentences?"})
    print(response)


async def test_streaming():
    """Test 2: streaming — tokens appear one by one as they're generated"""
    print("\n--- Test 2: Streaming tokens ---")
    chain = get_qa_chain()

    # astream() yields chunks as they arrive from the LLM
    async for chunk in chain.astream(
        {"question": "Explain Python list comprehensions simply."}
    ):
        print(chunk, end="", flush=True)
    print()


async def test_batch():
    """Test 3: batch — run multiple questions in parallel"""
    print("\n--- Test 3: Batch (3 questions at once) ---")
    chain = get_qa_chain()
    questions = [
        {"question": "What is Docker in one sentence?"},
        {"question": "What is a vector database in one sentence?"},
        {"question": "What is LangChain in one sentence?"},
    ]
    # abatch runs all questions concurrently — much faster than one by one
    responses = await chain.abatch(questions)
    for q, r in zip(questions, responses):
        print(f"Q: {q['question']}")
        print(f"A: {r}\n")


async def main():
    print("Testing LangChain + OpenRouter connection...\n")
    await test_basic_invoke()
    await test_streaming()
    await test_batch()
    print("\nAll tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
