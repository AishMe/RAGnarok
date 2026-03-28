import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from generation.rag_chain import get_rag_chain_with_sources

rag = get_rag_chain_with_sources(k=4)

questions = [
    "What is the importance of budgeting in personal finance?",
    "What is the capital of France?",
]

for q in questions:
    print(f"\nQ: {q}")
    print("-" * 50)
    result = rag(q)
    print(result["formatted"])
    print(f"\nhas_answer: {result['has_answer']}")
    print(f"citations count: {len(result['sources'])}")
    for s in result["sources"]:
        if s["doc_type"] == "web":
            print(f"  [{s['index']}] WEB: {s['source_url']}")
        else:
            print(f"  [{s['index']}] {s['filename']} p.{s['page']} score={s['score']}")
