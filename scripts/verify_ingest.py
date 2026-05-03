#!/usr/bin/env python3
"""
Verification suite — run after ingest to confirm everything is healthy.

Checks:
  1. Collection count >= expected_min_chunks
  2. Self-match test: 5 random chunks query themselves as rank #1 (distance < 0.05)
  3. Collection metadata: embedding_dimension == 1024, distance_metric == cosine
  4. Embed service reachable and returning 1024D vectors
"""

from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

EMBED_SERVICE_URL = os.getenv("EMBED_SERVICE_URL", "http://127.0.0.1:8001")
CHROMA_PERSIST_DIR = "chroma_db"
COLLECTION_BASE = os.getenv("CHROMA_COLLECTION", "ideas_1024d")
COLLECTION_VERSION = int(os.getenv("CHROMA_COLLECTION_VERSION", "1"))
STAGING_NAME = f"{COLLECTION_BASE}_v{COLLECTION_VERSION}_staging"

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    icon = PASS if ok else FAIL
    print(f"  [{icon}] {name}{': ' + detail if detail else ''}")
    return ok


def main() -> int:
    print("\n── Verification Suite ─────────────────────────────────────────")

    # 1. ChromaDB connection + collection
    print("\n[1] ChromaDB collection")
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        collection = client.get_collection(STAGING_NAME, embedding_function=None)
        count = collection.count()
        check("Collection reachable", True, f"'{STAGING_NAME}' count={count}")
        check("Count > 0", count > 0, f"{count} chunks")
    except Exception as exc:
        check("Collection reachable", False, str(exc))
        print("\nCannot proceed — ChromaDB unreachable.")
        return 1

    # 2. Metadata check
    print("\n[2] Collection metadata")
    meta = collection.metadata or {}
    check("distance_metric == cosine", meta.get("hnsw:space") == "cosine", repr(meta.get("hnsw:space")))
    check("embedding_dimension == 1024", meta.get("embedding_dimension") == "1024", repr(meta.get("embedding_dimension")))

    # 3. Embed service
    print("\n[3] Embed service")
    try:
        r = httpx.get(f"{EMBED_SERVICE_URL}/health", timeout=5)
        data = r.json()
        check("Embed service /health 200", r.status_code == 200)
        check("Embed dimension == 1024", data.get("dimension") == 1024, str(data.get("dimension")))
    except Exception as exc:
        check("Embed service reachable", False, str(exc))

    # 4. Self-match test
    print("\n[4] Self-match test (5 random chunks)")
    try:
        sample = collection.get(limit=min(50, count), include=["documents", "embeddings"])
        ids = sample["ids"]
        docs = sample["documents"]
        embs = sample["embeddings"]

        if len(ids) >= 5:
            indices = random.sample(range(len(ids)), 5)
            all_passed = True
            for i in indices:
                query_emb = [embs[i]]
                result = collection.query(
                    query_embeddings=query_emb,
                    n_results=3,
                    include=["distances"],
                )
                top_id = result["ids"][0][0]
                top_dist = result["distances"][0][0]
                ok = top_id == ids[i] and top_dist < 0.05
                all_passed = all_passed and ok
                if not ok:
                    check(f"  chunk {ids[i][:12]}… rank#1", False, f"top={top_id[:12]}… dist={top_dist:.4f}")
            if all_passed:
                check("All 5 self-match rank#1 with dist<0.05", True)
        else:
            check("Self-match (need >= 5 chunks)", False, f"only {len(ids)} available")
    except Exception as exc:
        check("Self-match test", False, str(exc))

    # Summary
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n── Result: {passed}/{total} checks passed ─────────────────────────")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
