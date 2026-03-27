import argparse
import logging
import os
import sys

from ingestion.pipeline import run_ingestion
from ingestion.vector_store import collection_stats

"""
CLI ingestion script.
Usage:
  python3 scripts/ingest.py --pdf data/sample
  python3 scripts/ingest.py --urls https://example.com https://other.com
  python3 scripts/ingest.py --pdf data/sample --urls https://example.com
"""


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main():
    parser = argparse.ArgumentParser(description="RAGnarok ingestion pipeline")
    parser.add_argument("--pdf", type=str, help="Folder path containing PDFs")
    parser.add_argument("--urls", type=str, nargs="+", help="URLs to ingest")
    args = parser.parse_args()

    if not args.pdf and not args.urls:
        parser.print_help()
        sys.exit(1)

    print("\nStarting ingestion...\n")
    results = run_ingestion(
        pdf_folder=args.pdf,
        urls=args.urls,
    )

    print("\nResults:")
    for r in results:
        status = "✓" if not r.errors else "✗"
        print(f"  {status} {r.source}")
        print(f"    Loaded:  {r.docs_loaded} docs")
        print(f"    Chunked: {r.chunks_created} chunks")
        print(f"    Added:   {r.chunks_added} new chunks")
        if r.errors:
            print(f"    Errors:  {r.errors}")

    print(f"\nTotal in ChromaDB: {collection_stats()['total_chunks']} chunks")


if __name__ == "__main__":
    main()
