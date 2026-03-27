import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from generation.rag_chain import get_rag_chain, get_rag_chain_with_sources


async def test_streaming():
    print("=" * 60)
    print("TEST 1: Streaming RAG answer")
    print("=" * 60)
    chain = get_rag_chain(k=4)
    question = "What is personal finance and why is it important?"
    print(f"Q: {question}\nA: ", end="", flush=True)
    async for chunk in chain.astream(question):
        print(chunk, end="", flush=True)
    print("\n")


def test_with_sources():
    print("=" * 60)
    print("TEST 2: Answer with sources")
    print("=" * 60)
    rag = get_rag_chain_with_sources(k=3)
    result = rag("What should students know about saving money?")
    print(f"Answer:\n{result['answer']}\n")
    print("Sources:")
    for s in result["sources"]:
        print(f"  - {s['filename']} p.{s['page']} (score: {s['score']})")
        print(f"    {s['preview'][:100]}...")


def test_out_of_context():
    print("=" * 60)
    print("TEST 3: Question outside the document (should say 'I don't know')")
    print("=" * 60)
    rag = get_rag_chain_with_sources(k=3)
    result = rag("What is the capital of France?")
    print(f"Answer: {result['answer']}\n")


async def main():
    await test_streaming()
    test_with_sources()
    test_out_of_context()
    print("=" * 60)
    print("RAG chain working end to end!")


if __name__ == "__main__":
    asyncio.run(main())
