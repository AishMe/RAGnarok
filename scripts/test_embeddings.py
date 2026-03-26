import os
import sys

import numpy as np

from ingestion.embeddings import get_embeddings

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def cosine_similarity(vec_a: list, vec_b: list) -> float:
    """
    Measures how similar two vectors are.
    Returns a score from -1 to 1:
      1.0  = identical meaning
      0.8+ = very similar
      0.5  = somewhat related
      0.0  = unrelated
     -1.0  = opposite meaning
    """
    a = np.array(vec_a)
    b = np.array(vec_b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def print_similarity_matrix(sentences: list[str], embeddings: list[list[float]]):
    """Prints a grid showing similarity scores between all sentence pairs."""
    n = len(sentences)
    labels = [f"S{i+1}" for i in range(n)]

    # Print legend
    print("\nSentences:")
    for i, s in enumerate(sentences):
        print(f"  S{i+1}: {s}")

    # Print matrix header
    print("\nSimilarity matrix (1.0 = identical, 0.0 = unrelated):\n")
    header = f"{'':>6}" + "".join(f"{i:>8}" for i in labels)
    print(header)
    print("-" * (6 + 8 * n))

    # Print each row
    for i in range(n):
        row = f"{labels[i]:>6}"
        for j in range(n):
            score = cosine_similarity(embeddings[i], embeddings[j])
            row += f"{score:>8.2f}"
        print(row)


def main():
    print("Loading embedding model (downloads ~80MB on first run, then cached)...")
    embedder = get_embeddings()
    print("Model loaded.\n")

    # These 6 sentences test whether the model understands meaning
    sentences = [
        "The dog ran quickly through the park.",  # S1
        "A puppy sprinted fast across the garden.",  # S2 — should be CLOSE to S1
        "The cat sat quietly on the windowsill.",  # S3 — animal, but different
        "Quantum mechanics describes subatomic particles.",  # S4 — completely different
        "Machine learning models learn from data.",  # S5 — tech topic
        "Neural networks are used in deep learning.",  # S6 — should be CLOSE to S5
    ]

    print("Embedding all sentences...")
    # embed_documents() takes a list of strings, returns list of vectors
    vectors = embedder.embed_documents(sentences)

    print(f"Each sentence → vector of {len(vectors[0])} numbers")
    print(f"First 5 numbers of S1's vector: {[round(x, 4) for x in vectors[0][:5]]}\n")

    # Print the full similarity matrix
    print_similarity_matrix(sentences, vectors)

    # Highlight the most interesting pairs
    print("\n--- What to notice ---")
    s1_s2 = cosine_similarity(vectors[0], vectors[1])
    s1_s4 = cosine_similarity(vectors[0], vectors[3])
    s5_s6 = cosine_similarity(vectors[4], vectors[5])
    s1_s3 = cosine_similarity(vectors[0], vectors[2])

    print(
        f"S1 vs S2 (dog/puppy — same meaning):      {s1_s2:.3f}  ← should be HIGH (0.8+)"
    )
    print(
        f"S1 vs S4 (dog/quantum — no relation):     {s1_s4:.3f}  ← should be LOW  (0.1-)"
    )
    print(
        f"S5 vs S6 (ML/neural nets — same field):   {s5_s6:.3f}  ← should be HIGH (0.8+)"
    )
    print(
        f"S1 vs S3 (dog/cat — same category, diff): {s1_s3:.3f}  ← should be MID  (0.4-0.6)"
    )

    print("\n--- Single sentence embedding ---")
    query = "What animals move quickly?"
    query_vector = embedder.embed_query(query)
    print(f"Query: '{query}'")
    print(f"Vector dimensions: {len(query_vector)}")

    # Find which sentence is most similar to this query
    scores = [
        (i + 1, cosine_similarity(query_vector, vec)) for i, vec in enumerate(vectors)
    ]
    scores.sort(key=lambda x: x[1], reverse=True)
    print("\nMost similar sentences to the query:")
    for rank, (sid, score) in enumerate(scores[:3], 1):
        print(f"  #{rank}: S{sid} (score: {score:.3f}) — {sentences[sid-1]}")


if __name__ == "__main__":
    main()
