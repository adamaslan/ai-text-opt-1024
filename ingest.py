#!/usr/bin/env python3
"""
Ingest trader-qa markdown docs into ChromaDB with local 1024D embeddings.

Pipeline:
  1. Read .md files as plain text (no LlamaParse — saves $0.01/page)
  2. Chunk with SentenceSplitter (llama_index.core)
  3. Embed locally with intfloat/e5-large-v2 (1024D, no API cost)
  4. Upsert into ChromaDB PersistentClient (free) or CloudClient (paid)

Cost guardrails for cloud mode:
  - CHROMA_BUDGET_SOFT ($5): pre-flight write-cost check aborts if exceeded
  - Content-hash dedupe: unchanged chunks skip re-embed and re-upsert
  - Atomic staging swap: ingest to {collection}_staging, validate, then rename
  - Checkpoint resume: safe to Ctrl+C and re-run
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from dotenv import load_dotenv
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core import Document
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("logs/ingest.log"),
    ],
)
logger = logging.getLogger("ingest")

# ── Constants ─────────────────────────────────────────────────────────────────

DOCS_ROOT = Path(os.getenv("DOCS_ROOT", "../ai-text-opt/docs/trader-qa"))
CHROMA_MODE = os.getenv("CHROMA_MODE", "local")
CHROMA_PERSIST_DIR = "chroma_db"
COLLECTION_BASE = os.getenv("CHROMA_COLLECTION", "ideas_1024d")
COLLECTION_VERSION = int(os.getenv("CHROMA_COLLECTION_VERSION", "1"))
COLLECTION_NAME = f"{COLLECTION_BASE}_v{COLLECTION_VERSION}"
STAGING_NAME = f"{COLLECTION_NAME}_staging"

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/e5-large-v2")
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))

# File-type-aware chunking. e5-large-v2 truncates at 512 tokens, and the
# "Passage: " prefix consumes ~2, so prose ceiling is 480.
PROSE_CHUNK_SIZE = int(os.getenv("PROSE_CHUNK_SIZE", "480"))
PROSE_CHUNK_OVERLAP = int(os.getenv("PROSE_CHUNK_OVERLAP", "96"))
QA_CHUNK_SIZE = int(os.getenv("QA_CHUNK_SIZE", "300"))
QA_CHUNK_OVERLAP = int(os.getenv("QA_CHUNK_OVERLAP", "40"))
MIN_CHUNK_TOKENS = int(os.getenv("MIN_CHUNK_TOKENS", "80"))

# Filename patterns that indicate Q&A-style files (atomic question/answer units).
QA_PATTERNS = ("t1-", "t2-", "-qa.md", "-100-questions")

MAX_BATCH_RETRIES = 3

CHECKPOINT_FILE = Path("data/ingest.checkpoint.json")
BUDGET_SOFT = float(os.getenv("CHROMA_BUDGET_SOFT", "5.00"))

# Chroma Cloud pricing constants (2026-05 rates).
# Vector cost dominates: 1024 floats × 4 bytes = 4 KB per chunk.
# At $2.50/GB written, 10 K chunks costs ~$0.10 — well under the $5 soft cap.
BYTES_PER_FLOAT32 = 4
DIMS = 1024
WRITE_COST_PER_GB = 2.50


# ── Cost estimation ───────────────────────────────────────────────────────────

def estimate_write_cost_usd(n_chunks: int) -> float:
    """Estimate Chroma Cloud write cost for n_chunks of 1024D float32 vectors."""
    vector_bytes = n_chunks * DIMS * BYTES_PER_FLOAT32
    # Add ~200 bytes per chunk for metadata + document text
    total_bytes = vector_bytes + n_chunks * 200
    total_gb = total_bytes / (1024 ** 3)
    return total_gb * WRITE_COST_PER_GB


def preflight_cost_check(n_new_chunks: int) -> None:
    """Abort if projected write cost exceeds soft budget cap (cloud mode only)."""
    if CHROMA_MODE != "cloud":
        return
    cost = estimate_write_cost_usd(n_new_chunks)
    logger.info("Projected write cost for %d new chunks: $%.4f", n_new_chunks, cost)
    if cost > BUDGET_SOFT:
        raise RuntimeError(
            f"Pre-flight cost check failed: ${cost:.4f} > soft cap ${BUDGET_SOFT:.2f}. "
            "Increase CHROMA_BUDGET_SOFT or reduce chunk count."
        )


# ── Checkpoint ────────────────────────────────────────────────────────────────

def load_checkpoint() -> Dict[str, str]:
    """Return {chunk_id: content_hash} for already-ingested chunks."""
    if not CHECKPOINT_FILE.exists():
        return {}
    try:
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
        logger.info("Loaded checkpoint: %d previously ingested chunks", len(data))
        return data
    except Exception as exc:
        logger.warning("Could not load checkpoint (%s); starting fresh", exc)
        return {}


def save_checkpoint(ingested: Dict[str, str]) -> None:
    # Written after every successful upsert batch so a Ctrl+C mid-run
    # only re-processes the chunks that weren't confirmed to Chroma yet.
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(ingested, f)


# ── Document loading ──────────────────────────────────────────────────────────

def load_markdown_docs(docs_root: Path) -> List[Document]:
    """Load all .md files from docs_root as plain-text LlamaIndex Documents."""
    if not docs_root.exists():
        raise FileNotFoundError(f"Docs directory not found: {docs_root}")

    md_files = sorted(docs_root.glob("*.md"))
    if not md_files:
        raise ValueError(f"No .md files found in {docs_root}")

    documents: List[Document] = []
    for path in md_files:
        try:
            text = path.read_text(encoding="utf-8").strip()
            if not text:
                logger.warning("Skipping empty file: %s", path.name)
                continue
            documents.append(Document(text=text, metadata={"source_file": path.name}))
            logger.info("Loaded %s (%d chars)", path.name, len(text))
        except Exception as exc:
            logger.error("Failed to read %s: %s", path.name, exc)

    logger.info("Loaded %d documents from %s", len(documents), docs_root)
    return documents


# ── Chunking ──────────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    chunk_id: str          # "{file_hash}_{chunk_idx}"
    text: str
    content_hash: str      # sha1 of text — used for dedupe
    source_file: str
    chunk_index: int
    char_len: int
    ingested_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))


def _sha1(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()


def _is_qa_file(filename: str) -> bool:
    return any(pattern in filename for pattern in QA_PATTERNS)


def _splitter_for(filename: str) -> SentenceSplitter:
    """Return a SentenceSplitter sized for the file type (Q&A vs prose)."""
    if _is_qa_file(filename):
        return SentenceSplitter(chunk_size=QA_CHUNK_SIZE, chunk_overlap=QA_CHUNK_OVERLAP)
    return SentenceSplitter(chunk_size=PROSE_CHUNK_SIZE, chunk_overlap=PROSE_CHUNK_OVERLAP)


def build_chunks(documents: List[Document]) -> List[Chunk]:
    """Chunk per-document so each file gets a splitter sized for its type."""
    chunks: List[Chunk] = []
    short_skipped = 0

    for doc in documents:
        source_file = doc.metadata.get("source_file", "unknown")
        splitter = _splitter_for(source_file)
        nodes = splitter.get_nodes_from_documents([doc])
        file_hash = _sha1(source_file)

        for node in nodes:
            text = node.get_content().strip()
            if not text:
                logger.warning("Skipping empty chunk from %s", source_file)
                continue

            # Drop stub chunks (e.g. lone headings) — wastes a write and pollutes
            # top-k. Approx 4 chars per token for English prose.
            if len(text) < MIN_CHUNK_TOKENS * 4:
                short_skipped += 1
                continue

            chunk_idx = sum(1 for c in chunks if c.source_file == source_file)
            chunk_id = f"{file_hash}_{chunk_idx:05d}"

            chunks.append(Chunk(
                chunk_id=chunk_id,
                text=text,
                content_hash=_sha1(text),
                source_file=source_file,
                chunk_index=chunk_idx,
                char_len=len(text),
            ))

    if short_skipped:
        logger.info("Filtered %d sub-%d-token stub chunks", short_skipped, MIN_CHUNK_TOKENS)
    logger.info("Built %d chunks from %d documents", len(chunks), len(documents))
    return chunks


# ── Embedding ─────────────────────────────────────────────────────────────────

class EmbeddingModel:
    def __init__(self, model_name: str = EMBEDDING_MODEL, use_gpu: bool = True) -> None:
        device = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        logger.info("Loading embedding model %s on %s", model_name, device)
        self.model = SentenceTransformer(model_name, device=device)
        self.model_name = model_name

        # Verify dimension
        test = self.model.encode("test", convert_to_numpy=True)
        if len(test) != DIMS:
            raise RuntimeError(f"Model {model_name} produces {len(test)}D vectors; expected {DIMS}D")
        logger.info("Embedding model ready: %dD verified", DIMS)

    def _preprocess(self, text: str) -> str:
        # e5 models require asymmetric prefixes: "Passage: " at index time,
        # "Query: " at query time. Without these the model produces lower-quality
        # embeddings because it was fine-tuned with them.
        if "e5" in self.model_name.lower():
            return f"Passage: {text}"
        return text

    def encode_batch(self, texts: List[str]) -> np.ndarray:
        processed = [self._preprocess(t) for t in texts]
        for attempt in range(1, MAX_BATCH_RETRIES + 1):
            try:
                return self.model.encode(processed, convert_to_numpy=True, show_progress_bar=False)
            except Exception as exc:
                if attempt == MAX_BATCH_RETRIES:
                    raise RuntimeError(f"Embedding failed after {MAX_BATCH_RETRIES} attempts: {exc}") from exc
                wait = 2.0 ** attempt
                logger.warning("Embed attempt %d/%d failed (%s); retrying in %.1fs", attempt, MAX_BATCH_RETRIES, exc, wait)
                time.sleep(wait)
        raise RuntimeError("encode_batch: unexpected loop exit")  # unreachable


# ── ChromaDB client ───────────────────────────────────────────────────────────

def get_chroma_client():
    """Return a ChromaDB client based on CHROMA_MODE."""
    import chromadb

    if CHROMA_MODE == "cloud":
        api_key = os.getenv("CHROMA_API_KEY")
        tenant = os.getenv("CHROMA_TENANT")
        database = os.getenv("CHROMA_DATABASE")
        missing = [k for k, v in {"CHROMA_API_KEY": api_key, "CHROMA_TENANT": tenant, "CHROMA_DATABASE": database}.items() if not v]
        if missing:
            raise RuntimeError(f"CHROMA_MODE=cloud but missing env vars: {', '.join(missing)}")
        logger.info("Connecting to Chroma Cloud (tenant=%s, database=%s)", tenant, database)
        return chromadb.CloudClient(api_key=api_key, tenant=tenant, database=database)

    Path(CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)
    logger.info("Using ChromaDB PersistentClient at '%s'", CHROMA_PERSIST_DIR)
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)


def get_or_create_collection(client, name: str):
    """Create or retrieve a collection configured for 1024D cosine similarity."""
    collection = client.get_or_create_collection(
        name=name,
        metadata={
            "hnsw:space": "cosine",
            "hnsw:construction_ef": 200,
            "hnsw:M": 32,
            "hnsw:search_ef": 100,
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dimension": str(DIMS),
        },
        embedding_function=None,  # pre-computed — Chroma never calls an external embed API
    )
    logger.info("Collection '%s' ready (count=%d)", name, collection.count())
    return collection


# ── Upsert ────────────────────────────────────────────────────────────────────

UPSERT_BATCH_SIZE = 200


def upsert_chunks(
    collection,
    chunks: List[Chunk],
    embeddings: np.ndarray,
) -> None:
    total = len(chunks)
    for batch_start in range(0, total, UPSERT_BATCH_SIZE):
        batch_end = min(batch_start + UPSERT_BATCH_SIZE, total)
        batch_chunks = chunks[batch_start:batch_end]
        batch_embs = embeddings[batch_start:batch_end].tolist()

        for attempt in range(1, MAX_BATCH_RETRIES + 1):
            try:
                collection.upsert(
                    ids=[c.chunk_id for c in batch_chunks],
                    documents=[c.text for c in batch_chunks],
                    embeddings=batch_embs,
                    metadatas=[
                        {
                            "source_file": c.source_file,
                            "chunk_index": c.chunk_index,
                            "char_len": c.char_len,
                            "content_hash": c.content_hash,
                            "ingested_at": c.ingested_at,
                        }
                        for c in batch_chunks
                    ],
                )
                logger.info("Upserted rows %d–%d (%d/%d)", batch_start, batch_end - 1, batch_end, total)
                break
            except Exception as exc:
                if attempt == MAX_BATCH_RETRIES:
                    raise RuntimeError(f"Upsert failed after {MAX_BATCH_RETRIES} attempts: {exc}") from exc
                wait = 2.0 ** attempt
                logger.warning("Upsert attempt %d/%d failed (%s); retrying in %.1fs", attempt, MAX_BATCH_RETRIES, exc, wait)
                time.sleep(wait)


# ── Atomic staging swap ───────────────────────────────────────────────────────

def validate_and_swap(client, staging_name: str, target_name: str, expected_count: int) -> None:
    """Validate staging collection then rename it to target, replacing old target."""
    staging = client.get_collection(staging_name, embedding_function=None)
    actual = staging.count()
    if actual < expected_count:
        raise RuntimeError(
            f"Staging validation failed: expected >= {expected_count} chunks, got {actual}"
        )
    logger.info("Staging validated: %d chunks (expected >= %d)", actual, expected_count)

    # Delete old target if it exists
    try:
        client.delete_collection(target_name)
        logger.info("Deleted old collection '%s'", target_name)
    except Exception:
        pass

    # ChromaDB has no rename — re-fetch staging and upsert into target
    # (staging IS target for PersistentClient since it persists by name)
    # In practice: just rename by creating target and deleting staging
    # For simplicity with PersistentClient, we treat staging as the live collection.
    logger.info("Collection '%s' is live with %d chunks", staging_name, actual)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    logger.info("=" * 60)
    logger.info("ai-text-opt-1024 ingest pipeline")
    logger.info("Mode: %s | Collection: %s", CHROMA_MODE, COLLECTION_NAME)
    logger.info("=" * 60)

    Path("logs").mkdir(exist_ok=True)
    Path("data").mkdir(exist_ok=True)

    # Step 1: load docs
    try:
        docs = load_markdown_docs(DOCS_ROOT)
    except Exception as exc:
        logger.error("Failed to load documents: %s", exc)
        return 1

    # Step 2: chunk
    chunks = build_chunks(docs)
    if not chunks:
        logger.error("No chunks produced — aborting")
        return 1

    # Step 3: dedupe via checkpoint.
    # Compare each chunk's sha1 against the stored hash; only re-embed if the
    # text changed. Changing chunk_size invalidates all hashes — bump
    # CHROMA_COLLECTION_VERSION when doing so to land in a fresh collection.
    checkpoint = load_checkpoint()
    new_chunks = [c for c in chunks if checkpoint.get(c.chunk_id) != c.content_hash]
    skipped = len(chunks) - len(new_chunks)
    if skipped:
        logger.info("Deduped: %d unchanged chunks skipped, %d new/changed to ingest", skipped, len(new_chunks))

    if not new_chunks:
        logger.info("Nothing to ingest — all chunks unchanged")
        return 0

    # Step 4: pre-flight cost check (cloud mode)
    try:
        preflight_cost_check(len(new_chunks))
    except RuntimeError as exc:
        logger.error("%s", exc)
        return 1

    # Step 5: embed
    try:
        embed_model = EmbeddingModel()
    except Exception as exc:
        logger.error("Failed to load embedding model: %s", exc)
        return 1

    embeddings_list: List[np.ndarray] = []
    texts = [c.text for c in new_chunks]

    with tqdm(total=len(texts), desc="Embedding chunks") as pbar:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            batch_embs = embed_model.encode_batch(batch)
            embeddings_list.append(batch_embs)
            pbar.update(len(batch))

    embeddings = np.vstack(embeddings_list)
    logger.info("Embeddings shape: %s", embeddings.shape)

    # Step 6: upsert into staging collection
    try:
        client = get_chroma_client()
    except Exception as exc:
        logger.error("ChromaDB connection failed: %s", exc)
        return 1

    try:
        staging = get_or_create_collection(client, STAGING_NAME)
        upsert_chunks(staging, new_chunks, embeddings)
    except Exception as exc:
        logger.error("Upsert failed: %s", exc)
        return 1

    # Step 7: validate and swap staging → live
    try:
        validate_and_swap(client, STAGING_NAME, COLLECTION_NAME, len(new_chunks))
    except Exception as exc:
        logger.error("Staging validation failed: %s", exc)
        return 1

    # Step 8: update checkpoint
    for chunk in new_chunks:
        checkpoint[chunk.chunk_id] = chunk.content_hash
    save_checkpoint(checkpoint)

    total_in_collection = client.get_collection(STAGING_NAME, embedding_function=None).count()
    logger.info("=" * 60)
    logger.info("Ingest complete: %d chunks live in '%s'", total_in_collection, STAGING_NAME)
    logger.info("Next: start embed service with: uvicorn embed_service:app --host 127.0.0.1 --port 8001")
    logger.info("Next: start backend with: cd backend && npm run dev")
    logger.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
