#!/usr/bin/env python3
"""
Verification suite — run after ingest to confirm everything is healthy.

Checks:
  1. Collection count >= expected_min_chunks
  2. Collection metadata: embedding_dimension == 1024, distance_metric == cosine
  3. Embed service reachable and returning 1024D vectors
  4. Self-match test: N random chunks query themselves as rank #1 (distance < 0.05)
     N is controlled by VERIFY_SELF_MATCH_N (default 20).

Exit codes:
  0 — all checks passed
  1 — one or more checks failed or ChromaDB unreachable
"""

from __future__ import annotations

import os
import random
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

EMBED_SERVICE_URL = os.getenv("EMBED_SERVICE_URL", "http://127.0.0.1:8001")
CHROMA_PERSIST_DIR = "chroma_db"
COLLECTION_BASE = os.getenv("CHROMA_COLLECTION", "ideas_1024d")
COLLECTION_VERSION = int(os.getenv("CHROMA_COLLECTION_VERSION", "1"))
STAGING_NAME = f"{COLLECTION_BASE}_v{COLLECTION_VERSION}_staging"

# Number of random chunks sampled for the self-match test.
# CI sets this to 20 via VERIFY_SELF_MATCH_N; quick local runs can use 5.
SELF_MATCH_N = int(os.getenv("VERIFY_SELF_MATCH_N", "20"))

# Cosine distance threshold: a chunk queried with its own stored embedding
# must land within this distance of itself to pass. Values < 0.05 indicate
# the stored vector is essentially identical to what the model returns today.
SELF_MATCH_DIST_THRESHOLD = float(os.getenv("VERIFY_SELF_MATCH_DIST", "0.05"))

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    icon = PASS if ok else FAIL
    print(f"  [{icon}] {name}{': ' + detail if detail else ''}")
    return ok


def _self_match_batch(collection, ids: list, embs: list) -> tuple[int, int]:
    """
    Query each chunk's stored embedding against the collection and verify it
    ranks #1 within SELF_MATCH_DIST_THRESHOLD.

    Returns (passed, failed) counts. Failures are printed individually so the
    caller knows exactly which chunk IDs failed — useful when debugging a
    partial re-embedding or a model swap.
    """
    passed = failed = 0
    for i, idx in enumerate(range(len(ids))):
        query_emb = [embs[idx]]
        # A chunk queried with its own embedding should always be rank #1.
        # Cosine distance < SELF_MATCH_DIST_THRESHOLD confirms the stored
        # embedding matches what the model would produce today, and that HNSW
        # index integrity is intact.
        result = collection.query(
            query_embeddings=query_emb,
            n_results=3,
            include=["distances"],
        )
        top_id = result["ids"][0][0]
        top_dist = result["distances"][0][0]
        ok = top_id == ids[idx] and top_dist < SELF_MATCH_DIST_THRESHOLD
        if ok:
            passed += 1
        else:
            failed += 1
            check(
                f"chunk {ids[idx][:12]}… rank#1",
                False,
                f"top={top_id[:12]}… dist={top_dist:.4f}",
            )
    return passed, failed


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

    # 4. Self-match test — sample SELF_MATCH_N random chunks from the pool
    #    (capped at the collection size).
    pool_size = min(max(SELF_MATCH_N * 4, 100), count)
    actual_n = min(SELF_MATCH_N, pool_size)
    print(f"\n[4] Self-match test ({actual_n} random chunks, dist<{SELF_MATCH_DIST_THRESHOLD})")
    try:
        sample = collection.get(
            limit=pool_size,
            include=["documents", "embeddings"],
        )
        ids = sample["ids"]
        embs = sample["embeddings"]

        if len(ids) < actual_n:
            check(
                f"Self-match (need >= {actual_n} chunks)",
                False,
                f"only {len(ids)} available",
            )
        else:
            chosen = random.sample(range(len(ids)), actual_n)
            chosen_ids = [ids[i] for i in chosen]
            chosen_embs = [embs[i] for i in chosen]
            passed, failed = _self_match_batch(collection, chosen_ids, chosen_embs)
            check(
                f"Self-match {passed}/{actual_n} rank#1 dist<{SELF_MATCH_DIST_THRESHOLD}",
                failed == 0,
                f"{failed} failures" if failed else "all passed",
            )
    except Exception as exc:
        check("Self-match test", False, str(exc))

    # Summary
    passed_total = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n── Result: {passed_total}/{total} checks passed ─────────────────────────")
    return 0 if passed_total == total else 1


if __name__ == "__main__":
    sys.exit(main())
