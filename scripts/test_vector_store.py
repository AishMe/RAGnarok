import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.chunker import chunk_recursive
from ingestion.loaders import load_pdf_folder
from ingestion.vector_store import add_documents, collection_stats, similarity_search

# make sure Docker is running first
print("Step 1: Load + chunk")
docs = load_pdf_folder("data/sample")
chunks = chunk_recursive(docs)
print(f"  {len(chunks)} chunks ready\n")

print("Step 2: Add to ChromaDB (first run embeds everything ~2 min)")
added = add_documents(chunks)
print(f"  Added {added} new chunks\n")

print("Step 3: Stats")
print(f"  {collection_stats()}\n")

print("Step 4: Search")
query = "what is personal finance?"
results = similarity_search(query, k=3)
print(f"  Query: '{query}'")
for i, doc in enumerate(results, 1):
    print(f"  Result {i} (score={doc.metadata['similarity_score']}):")
    print(f"    {doc.page_content[:150]}")
    print(f"    Source: {doc.metadata.get('filename')} p.{doc.metadata.get('page')}")

print("\nStep 5: Run again — should say 0 new docs (deduplication)")
added2 = add_documents(chunks)
print(f"  Added: {added2} (expected 0)")
