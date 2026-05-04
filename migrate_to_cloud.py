#!/usr/bin/env python3
"""
One-shot migration: copy all chunks from local ChromaDB to Chroma Cloud.

No re-embedding — vectors are copied as-is from the local persistent store.

Idempotency:
  Upsert is used throughout, so re-running never duplicates chunks.
  If the cloud count already matches local, the script exits early (--force
  overrides this guard and re-upserts everything).

Count verification:
  After uploading, the script re-queries the cloud collection count and asserts
  it equals the local source count. A mismatch means some batches failed silently
  (e.g. due to a rate limit); the script exits 1 so CI catches the failure.

Usage:
  python migrate_to_cloud.py
  python migrate_to_cloud.py --force    # skip idempotency check, re-upsert all
  python migrate_to_cloud.py --dry-run  # print what would happen, no writes
"""

from __future__ import annotations

import argparse
import os
import sys

import chromadb
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

LOCAL_COLLECTION = os.getenv("LOCAL_COLLECTION", "ideas_1024d_v2_staging")
LOCAL_PATH = os.getenv("CHROMA_PERSIST_DIR", "chroma_db")
CLOUD_COLLECTION = os.getenv("CHROMA_COLLECTION", "t1-t2a")
BATCH_SIZE = int(os.getenv("MIGRATE_BATCH_SIZE", "100"))


def _local_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=LOCAL_PATH)


def _cloud_client() -> chromadb.CloudClient:
    api_key = os.getenv("CHROMA_API_KEY")
    tenant = os.getenv("CHROMA_TENANT")
    database = os.getenv("CHROMA_DATABASE")
    missing = [k for k, v in {"CHROMA_API_KEY": api_key, "CHROMA_TENANT": tenant, "CHROMA_DATABASE": database}.items() if not v]
    if missing:
        print(f"ERROR: Missing required env vars for cloud: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    return chromadb.CloudClient(api_key=api_key, tenant=tenant, database=database)


def _verify_counts(local_count: int, cloud_count_after: int) -> bool:
    """
    Assert that the cloud collection absorbed every local chunk.

    We compare cloud count *after* upsert to the local source count. Equality
    is the invariant — upsert is idempotent, so re-runs converge on the same
    number rather than growing it. A lower cloud count means some batches were
    lost (network failure, rate limit, API error caught silently upstream).
    """
    if cloud_count_after == local_count:
        print(f"✓ Count verified: cloud={cloud_count_after} == local={local_count}")
        return True
    print(
        f"✗ Count mismatch: cloud={cloud_count_after} != local={local_count} "
        f"({local_count - cloud_count_after} chunks missing)",
        file=sys.stderr,
    )
    return False


def main(force: bool = False, dry_run: bool = False) -> int:
    print(f"Source : local '{LOCAL_COLLECTION}' at {LOCAL_PATH}/")
    tenant_prefix = (os.getenv("CHROMA_TENANT") or "")[:8]
    print(f"Target : cloud '{CLOUD_COLLECTION}' (tenant={tenant_prefix}...)")
    if dry_run:
        print("DRY RUN — no writes will be made")
    print()

    # ── Connect ──────────────────────────────────────────────────────────────
    local = _local_client()
    try:
        src = local.get_collection(LOCAL_COLLECTION, embedding_function=None)
    except Exception as exc:
        print(f"ERROR: Local collection '{LOCAL_COLLECTION}' not found: {exc}", file=sys.stderr)
        return 1

    local_count = src.count()
    print(f"Local collection: {local_count} chunks")

    if local_count == 0:
        print("ERROR: Local collection is empty — run ingest.py first.", file=sys.stderr)
        return 1

    cloud = _cloud_client()
    dst = cloud.get_or_create_collection(
        CLOUD_COLLECTION,
        metadata={"hnsw:space": "cosine", "embedding_dimension": "1024"},
    )
    cloud_count_before = dst.count()
    print(f"Cloud  collection: {cloud_count_before} chunks (before)")
    print()

    # ── Idempotency guard ────────────────────────────────────────────────────
    # If cloud already has the same number of chunks as local, we are up to
    # date. Re-upserting thousands of vectors wastes time and write quota.
    # --force bypasses this guard when you want to explicitly re-sync.
    if not force and cloud_count_before >= local_count:
        print(
            f"Cloud collection already has {cloud_count_before} chunks "
            f"(local has {local_count}). Nothing to do."
        )
        print("Use --force to re-upsert anyway.")
        return 0

    if dry_run:
        batches = (local_count + BATCH_SIZE - 1) // BATCH_SIZE
        print(
            f"Would upsert {local_count} chunks in {batches} batches of {BATCH_SIZE}."
        )
        return 0

    # ── Page through local and upsert to cloud ───────────────────────────────
    offset = 0
    upserted = 0
    failed_batches = 0

    with tqdm(total=local_count, unit="chunk") as bar:
        while offset < local_count:
            batch = src.get(
                limit=BATCH_SIZE,
                offset=offset,
                include=["embeddings", "documents", "metadatas"],
            )
            if not batch["ids"]:
                break

            try:
                dst.upsert(
                    ids=batch["ids"],
                    embeddings=batch["embeddings"],
                    documents=batch["documents"],
                    metadatas=batch["metadatas"],
                )
                upserted += len(batch["ids"])
            except Exception as exc:
                failed_batches += 1
                print(
                    f"\nWARN: batch offset={offset} failed ({exc}); continuing…",
                    file=sys.stderr,
                )

            offset += BATCH_SIZE
            bar.update(len(batch["ids"]))

    print()
    print(f"Upserted {upserted}/{local_count} chunks ({failed_batches} failed batches).")

    # ── Count verification ───────────────────────────────────────────────────
    cloud_count_after = dst.count()
    print(f"Cloud collection count after migration: {cloud_count_after}")

    ok = _verify_counts(local_count, cloud_count_after)
    if not ok:
        print(
            "\nHint: re-run without --force to resume; upsert is idempotent so "
            "already-uploaded chunks will be skipped by ChromaDB.",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local ChromaDB → Chroma Cloud")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-upsert all chunks even if cloud count >= local count",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without writing anything",
    )
    args = parser.parse_args()
    sys.exit(main(force=args.force, dry_run=args.dry_run))
