import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.loaders import load_json_records, load_pdf_folder, load_urls

# Test PDF
docs = load_pdf_folder("data/sample")
print(f"PDF: loaded {len(docs)} pages")
if docs:
    print(f"  First doc metadata: {docs[0].metadata}")
    print(f"  First 100 chars: {docs[0].page_content[:100]}")

# Test Web
web_docs = load_urls(["https://en.wikipedia.org/wiki/Retrieval-augmented_generation"])
print(f"\nWeb: loaded {len(web_docs)} pages")

# Test JSON
records = [
    {
        "title": "RAG intro",
        "body": "RAG stands for Retrieval-Augmented Generation.",
        "author": "Alice",
    },
    {
        "title": "Embeddings",
        "body": "Embeddings convert text to vectors.",
        "author": "Bob",
    },
]
json_docs = load_json_records(
    records, content_key="body", metadata_keys=["title", "author"]
)
print(f"\nJSON: loaded {len(json_docs)} docs")
print(f"  Doc hash example: {json_docs[0].metadata['doc_hash']}")
