#!/usr/bin/env python3
"""
MindVault Semantic Embedder
Converts text into a 384-dimensional vector using sentence-transformers.
Model: all-MiniLM-L6-v2 (~90 MB, multilingual-friendly, fast on CPU/MPS)

Input  (argv[1]): JSON string { text: str }
Output (stdout):  JSON string { embedding: [float, ...] (384 dims) }
"""

import sys
import json


def embed(text: str) -> list[float]:
    from sentence_transformers import SentenceTransformer
    import numpy as np

    model = SentenceTransformer("all-MiniLM-L6-v2")
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided. Pass JSON as argv[1]."}))
        sys.exit(1)

    try:
        data = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON parse error: {e}"}))
        sys.exit(1)

    text = data.get("text", "").strip()
    if not text:
        print(json.dumps({"error": "Empty text — nothing to embed."}))
        sys.exit(1)

    try:
        embedding = embed(text)
        print(json.dumps({"embedding": embedding, "dims": len(embedding)}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
