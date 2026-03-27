import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingestion.chunker import chunk_recursive, chunk_sentence_window
from ingestion.loaders import load_pdf_folder

docs = load_pdf_folder("data/sample")
print(f"Loaded {len(docs)} pages\n")

# test recursive
chunks = chunk_recursive(docs, chunk_size=512, chunk_overlap=64)
sizes = [c.metadata["chunk_size"] for c in chunks]
print("Recursive chunking:")
print(f"  Total chunks : {len(chunks)}")
print(f"  Avg size     : {sum(sizes)//len(sizes)} chars")
print(f"  Min/Max size : {min(sizes)} / {max(sizes)} chars")
print(f"  Sample chunk :\n  {chunks[10].page_content[:200]}")
print(f"  Metadata     : {chunks[10].metadata}\n")

# test sentence window
sw_chunks = chunk_sentence_window(docs)
print("Sentence-window chunking:")
print(f"  Total chunks : {len(sw_chunks)}")
print(f"  Window text preview: {sw_chunks[10].metadata['window_text'][:200]}")
