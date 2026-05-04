"""
End-to-end RAG query test against the live ChromaDB collection.

Requires:
  CHROMA_MODE=cloud  (or local with a populated chroma_db/)
  Cloud mode: CHROMA_API_KEY, CHROMA_TENANT, CHROMA_DATABASE
  EMBED_SERVICE_URL  — the running embed service (default http://127.0.0.1:8001)

Skip conditions:
  - CHROMA_MODE=cloud without cloud credentials → skipped (not an error in local CI)
  - Embed service unreachable → skipped (not installed in this env)
  - Collection empty or missing → fails (collection must exist post-ingest)

Run:
  pytest tests/test_rag_e2e.py -v
  pytest tests/test_rag_e2e.py -v -m cloud   # cloud-only subset

Markers:
  e2e    — requires a live ChromaDB collection
  cloud  — additionally requires CHROMA_MODE=cloud credentials
"""

from __future__ import annotations

import os

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv()

# ── Fixtures / helpers ────────────────────────────────────────────────────────

CHROMA_MODE = os.getenv("CHROMA_MODE", "local")
EMBED_SERVICE_URL = os.getenv("EMBED_SERVICE_URL", "http://127.0.0.1:8001")
COLLECTION_BASE = os.getenv("CHROMA_COLLECTION", "ideas_1024d")
COLLECTION_VERSION = int(os.getenv("CHROMA_COLLECTION_VERSION", "2"))
COLLECTION_NAME = f"{COLLECTION_BASE}_v{COLLECTION_VERSION}_staging"
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "chroma_db")

# Score threshold must match the RAG layer (rag.ts / SCORE_THRESHOLD).
RAG_SCORE_THRESHOLD = float(os.getenv("RAG_SCORE_THRESHOLD", "0.75"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "8"))

_CLOUD_CREDS_PRESENT = all(
    os.getenv(k) for k in ("CHROMA_API_KEY", "CHROMA_TENANT", "CHROMA_DATABASE")
)


def _embed_service_up() -> bool:
    try:
        r = httpx.get(f"{EMBED_SERVICE_URL}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def _get_collection():
    """Return the live ChromaDB collection or raise a skip/fail as appropriate."""
    import chromadb

    if CHROMA_MODE == "cloud":
        if not _CLOUD_CREDS_PRESENT:
            pytest.skip("CHROMA_MODE=cloud but cloud credentials not set")
        client = chromadb.CloudClient(
            api_key=os.environ["CHROMA_API_KEY"],
            tenant=os.environ["CHROMA_TENANT"],
            database=os.environ["CHROMA_DATABASE"],
        )
    else:
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

    try:
        return client.get_collection(COLLECTION_NAME, embedding_function=None)
    except Exception as exc:
        pytest.fail(
            f"Collection '{COLLECTION_NAME}' not found — run ingest.py first. ({exc})"
        )


def _embed_query(text: str) -> list[float]:
    """Embed a query string via the embed service."""
    if not _embed_service_up():
        pytest.skip("Embed service not reachable — start with: uvicorn embed_service:app --host 127.0.0.1 --port 8001")
    resp = httpx.post(
        f"{EMBED_SERVICE_URL}/embed",
        json={"texts": [text], "is_query": True},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    emb = data["embeddings"][0]
    assert len(emb) == 1024, f"Expected 1024D embedding, got {len(emb)}D"
    return emb


# ── Markers ───────────────────────────────────────────────────────────────────

pytestmark = pytest.mark.e2e


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCollectionHealth:
    """Basic sanity checks that the collection is ready to serve queries."""

    def test_collection_is_non_empty(self):
        col = _get_collection()
        count = col.count()
        assert count > 0, f"Collection '{COLLECTION_NAME}' is empty — run ingest.py"

    def test_collection_metadata_cosine(self):
        col = _get_collection()
        meta = col.metadata or {}
        assert meta.get("hnsw:space") == "cosine", (
            f"Expected hnsw:space=cosine, got {meta.get('hnsw:space')!r}"
        )

    def test_collection_metadata_dimension(self):
        col = _get_collection()
        meta = col.metadata or {}
        assert meta.get("embedding_dimension") == "1024", (
            f"Expected embedding_dimension='1024', got {meta.get('embedding_dimension')!r}"
        )


class TestEmbedService:
    """Embed service contract tests."""

    def test_health_returns_1024d(self):
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")
        r = httpx.get(f"{EMBED_SERVICE_URL}/health", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert data.get("dimension") == 1024

    def test_embed_query_shape(self):
        emb = _embed_query("What is momentum trading?")
        assert len(emb) == 1024

    def test_embed_document_shape(self):
        """Passage-mode embedding should also return 1024D."""
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")
        resp = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": ["Swing trading uses technical analysis."], "is_query": False},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        assert len(data["embeddings"][0]) == 1024


class TestRagQueryE2E:
    """
    End-to-end RAG retrieval: embed a query → query ChromaDB → validate results.

    These tests exercise the full retrieval stack without the LLM layer, so they
    are fast, deterministic (same query → same top-k), and free of LLM API cost.
    """

    _T1_QUERY = "How does a T1 tactical trader manage stop-loss on momentum trades?"
    _T2_QUERY = "What position sizing approach does a T2 structured investor use?"
    _GENERIC_QUERY = "What is swing trading?"

    def _query(self, text: str, where: dict | None = None, n: int = RAG_TOP_K):
        col = _get_collection()
        emb = _embed_query(text)
        kwargs: dict = dict(
            query_embeddings=[emb],
            n_results=n,
            include=["documents", "metadatas", "distances"],
        )
        if where:
            kwargs["where"] = where
        return col.query(**kwargs)

    def test_generic_query_returns_results(self):
        """A broad query should always retrieve at least one chunk."""
        raw = self._query(self._GENERIC_QUERY)
        ids = raw["ids"][0]
        assert len(ids) > 0, "Expected at least one result for generic swing-trading query"

    def test_distances_are_valid_cosine(self):
        """All returned distances must be in [0, 2] (cosine distance range)."""
        raw = self._query(self._GENERIC_QUERY)
        dists = raw["distances"][0]
        assert dists, "No distances returned"
        for d in dists:
            assert 0.0 <= d <= 2.0, f"Distance {d} outside valid cosine range [0, 2]"

    def test_top_result_within_threshold(self):
        """The top-1 result for a well-formed query must beat the score threshold."""
        raw = self._query(self._GENERIC_QUERY, n=1)
        dists = raw["distances"][0]
        assert dists, "No distances returned"
        assert dists[0] <= RAG_SCORE_THRESHOLD, (
            f"Top-1 distance {dists[0]:.4f} exceeds threshold {RAG_SCORE_THRESHOLD}. "
            "Collection may be empty, wrongly embedded, or query prefix is wrong."
        )

    def test_results_have_required_metadata_fields(self):
        """Every returned chunk must carry source_file, chunk_index, char_len."""
        raw = self._query(self._GENERIC_QUERY)
        metas = raw["metadatas"][0]
        assert metas, "No metadatas returned"
        for i, m in enumerate(metas):
            assert "source_file" in m, f"Result {i} missing 'source_file'"
            assert "chunk_index" in m, f"Result {i} missing 'chunk_index'"
            assert "char_len" in m, f"Result {i} missing 'char_len'"

    def test_t1_file_filter(self):
        """
        Querying with where={source_file: t1-...} should only return T1 chunks.
        This validates the per-trader file filter used by rag.ts / queryTrader().
        """
        T1_FILE = "t1-tactical-opportunist-100-questions.md"
        raw = self._query(self._T1_QUERY, where={"source_file": T1_FILE})
        metas = raw["metadatas"][0]
        if not metas:
            pytest.skip(f"No results for T1 file filter — '{T1_FILE}' may not be ingested")
        for m in metas:
            assert m.get("source_file") == T1_FILE, (
                f"Expected source_file={T1_FILE!r}, got {m.get('source_file')!r}"
            )

    def test_t2_file_filter(self):
        """
        Querying with where={source_file: t2-...} should only return T2 chunks.
        """
        T2_FILE = "t2-structured-growth-investor-100-questions.md"
        raw = self._query(self._T2_QUERY, where={"source_file": T2_FILE})
        metas = raw["metadatas"][0]
        if not metas:
            pytest.skip(f"No results for T2 file filter — '{T2_FILE}' may not be ingested")
        for m in metas:
            assert m.get("source_file") == T2_FILE, (
                f"Expected source_file={T2_FILE!r}, got {m.get('source_file')!r}"
            )

    def test_results_are_ranked_by_distance(self):
        """ChromaDB must return results in ascending distance order."""
        raw = self._query(self._GENERIC_QUERY)
        dists = raw["distances"][0]
        assert dists == sorted(dists), (
            f"Results not sorted by distance: {dists}"
        )

    def test_documents_are_non_empty_strings(self):
        """Every returned document text must be a non-empty string."""
        raw = self._query(self._GENERIC_QUERY)
        docs = raw["documents"][0]
        assert docs, "No documents returned"
        for i, doc in enumerate(docs):
            assert isinstance(doc, str) and doc.strip(), (
                f"Result {i} has empty or non-string document text"
            )

    @pytest.mark.cloud
    def test_cloud_collection_count_matches_expectation(self):
        """Cloud-only: collection must have at least 100 chunks after migration."""
        if CHROMA_MODE != "cloud":
            pytest.skip("CHROMA_MODE is not 'cloud'")
        col = _get_collection()
        count = col.count()
        assert count >= 100, (
            f"Cloud collection has only {count} chunks — migration may be incomplete"
        )


# ── New tests (issues #4–#7 follow-up) ───────────────────────────────────────


class TestEmbedServiceEdgeCases:
    """
    Edge cases and contract tests for the embed service that the happy-path
    suite does not exercise.
    """

    def test_query_prefix_improves_recall_vs_passage_prefix(self):
        """
        e5 asymmetric prefix: 'Query: ' at query time must produce a strictly
        lower top-1 cosine distance than 'Passage: ' (is_query=False) against
        the same collection.

        This is the single highest-risk silent failure in the pipeline — the
        wrong prefix produces plausible-looking but degraded embeddings.
        Wrong prefix will never raise; it just makes RAG quietly worse.
        """
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")

        query_text = "How does a momentum trader set stop-loss levels?"
        col = _get_collection()

        # Embed with correct query prefix
        resp_query = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [query_text], "is_query": True},
            timeout=15,
        )
        resp_query.raise_for_status()
        emb_query = resp_query.json()["embeddings"][0]

        # Embed with wrong passage prefix (simulates a bug where is_query=False
        # is accidentally passed at query time)
        resp_passage = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [query_text], "is_query": False},
            timeout=15,
        )
        resp_passage.raise_for_status()
        emb_passage = resp_passage.json()["embeddings"][0]

        # The two embeddings must actually be different — if the service ignores
        # is_query and always applies the same prefix, this test would pass for
        # the wrong reason, so check first.
        diff = sum(abs(a - b) for a, b in zip(emb_query, emb_passage))
        assert diff > 1e-3, (
            "Query-mode and passage-mode embeddings are identical — "
            "embed service may be ignoring the is_query flag"
        )

        dist_query = col.query(
            query_embeddings=[emb_query], n_results=1, include=["distances"]
        )["distances"][0][0]
        dist_passage = col.query(
            query_embeddings=[emb_passage], n_results=1, include=["distances"]
        )["distances"][0][0]

        assert dist_query < dist_passage, (
            f"Query-prefix distance ({dist_query:.4f}) is not better than "
            f"passage-prefix distance ({dist_passage:.4f}). "
            "The e5 asymmetric prefix may be broken at query time."
        )

    def test_empty_texts_returns_400(self):
        """
        POST /embed with texts=[] must return HTTP 400, not 500.

        rag.ts calls the embed service with a single-element texts array; an
        upstream bug could produce an empty list. A clear 400 is recoverable;
        a 500 is swallowed by the Next.js error handler and silently breaks RAG.
        """
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")
        resp = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [], "is_query": True},
            timeout=10,
        )
        assert resp.status_code == 400, (
            f"Expected 400 for empty texts, got {resp.status_code}. "
            "The embed service must reject empty input explicitly."
        )

    def test_batch_embedding_matches_single_embedding(self):
        """
        Embedding one text alone vs. embedding it as part of a 5-text batch
        must produce numerically identical vectors.

        SentenceTransformer processes batches with padding; padding can
        introduce float32 rounding differences if the model is not in eval()
        mode or if the batch normalisation paths differ.
        """
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")

        target = "What is position sizing in swing trading?"
        fillers = [
            "Risk management is important.",
            "Technical analysis uses charts.",
            "Moving averages signal trends.",
            "Candlestick patterns indicate reversals.",
        ]

        single = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [target], "is_query": True},
            timeout=15,
        ).json()["embeddings"][0]

        batched = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [target] + fillers, "is_query": True},
            timeout=15,
        ).json()["embeddings"][0]  # first element = target

        assert len(single) == len(batched) == 1024

        max_abs_diff = max(abs(a - b) for a, b in zip(single, batched))
        assert max_abs_diff < 1e-4, (
            f"Max element-wise difference between single and batch embedding: "
            f"{max_abs_diff:.2e}. SentenceTransformer batching is not stable."
        )

    def test_embedding_is_deterministic(self):
        """
        Calling POST /embed twice with the same text must return bit-for-bit
        identical float32 vectors.

        Nondeterminism would mean cached embeddings and live queries diverge,
        causing unexplained distance fluctuations between runs.
        """
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")

        text = "Stop-loss orders protect momentum traders from large drawdowns."
        emb1 = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [text], "is_query": True},
            timeout=15,
        ).json()["embeddings"][0]
        emb2 = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [text], "is_query": True},
            timeout=15,
        ).json()["embeddings"][0]

        assert emb1 == emb2, (
            "Embedding the same text twice produced different vectors. "
            "The model may have dropout enabled during inference."
        )

    def test_overlong_query_returns_1024d(self):
        """
        A query exceeding e5-large-v2's 512-token hard cap must not crash the
        embed service and must still return a 1024D vector.

        SentenceTransformer silently truncates; this test confirms the truncation
        path is hit without raising or returning a wrong-shaped result.
        """
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")

        # ~650 tokens of trading-adjacent text — well past the 512-token limit
        long_query = (
            "Momentum trading strategy risk management stop-loss position sizing "
            "technical analysis moving average RSI MACD Bollinger Bands candlestick "
            "breakout swing trade entry exit signal volume confirmation relative strength "
        ) * 15  # repeats to guarantee token count >> 512

        resp = httpx.post(
            f"{EMBED_SERVICE_URL}/embed",
            json={"texts": [long_query], "is_query": True},
            timeout=30,
        )
        assert resp.status_code == 200, (
            f"Embed service returned {resp.status_code} for overlong query: {resp.text[:200]}"
        )
        emb = resp.json()["embeddings"][0]
        assert len(emb) == 1024, (
            f"Overlong query produced {len(emb)}D vector instead of 1024D"
        )

    def test_adversarial_input_does_not_crash(self):
        """
        Emoji, null bytes, CJK characters, and garbage ASCII must not cause a
        500 from the embed service.  The result must be 1024D and distances
        against the collection must stay in the valid cosine range [0, 2].

        A 500 here propagates to the Next.js API route as an unhandled error.
        """
        if not _embed_service_up():
            pytest.skip("Embed service not reachable")

        adversarial_inputs = [
            "🚀📈💥🔥",                      # emoji
            "\x00\x01\x02",                   # control characters
            "你好世界 swing trading",           # CJK + English
            "   ",                             # whitespace only
            "a" * 2000,                        # very long ASCII without spaces
            "SELECT * FROM chunks; DROP TABLE;", # SQL injection attempt
        ]

        for text in adversarial_inputs:
            resp = httpx.post(
                f"{EMBED_SERVICE_URL}/embed",
                json={"texts": [text], "is_query": True},
                timeout=15,
            )
            # Must not crash
            assert resp.status_code in (200, 400), (
                f"Embed service returned {resp.status_code} for adversarial input "
                f"{text!r:.40}: {resp.text[:200]}"
            )
            if resp.status_code == 200:
                emb = resp.json()["embeddings"][0]
                assert len(emb) == 1024, (
                    f"Adversarial input {text!r:.40} returned {len(emb)}D vector"
                )
                # Distances against the collection must stay in [0, 2]
                col = _get_collection()
                result = col.query(
                    query_embeddings=[emb], n_results=1, include=["distances"]
                )
                dists = result["distances"][0]
                if dists:
                    assert 0.0 <= dists[0] <= 2.0, (
                        f"Adversarial input {text!r:.40} produced distance "
                        f"{dists[0]} outside [0, 2]"
                    )


class TestCollectionIntegrity:
    """
    Structural tests on the stored collection that go beyond counting.
    These catch silent bugs in ingest metadata writing.
    """

    def test_chunk_index_is_sequential_per_file(self):
        """
        For every source_file in the collection, chunk_index values must be
        0-based and form a gapless integer sequence.

        A gap means a chunk was silently dropped during ingest (e.g. by the
        MIN_CHUNK_TOKENS filter or a failed upsert batch). An overlap means two
        chunks were given the same ID, so one overwrote the other.
        """
        col = _get_collection()
        total = col.count()
        # Pull all metadata — embeddings excluded to keep payload small.
        result = col.get(limit=total, include=["metadatas"])
        metas = result["metadatas"]

        from collections import defaultdict
        by_file: dict[str, list[int]] = defaultdict(list)
        for m in metas:
            src = m.get("source_file", "")
            idx = m.get("chunk_index")
            if src and idx is not None:
                by_file[src].append(int(idx))

        assert by_file, "No source_file metadata found — ingest may have failed"

        gaps: list[str] = []
        for src, indices in by_file.items():
            indices.sort()
            expected = list(range(len(indices)))
            if indices != expected:
                gaps.append(
                    f"{src}: got {indices[:10]}{'…' if len(indices) > 10 else ''}, "
                    f"expected {expected[:10]}{'…' if len(expected) > 10 else ''}"
                )

        assert not gaps, (
            "chunk_index is not sequential for these files:\n" + "\n".join(gaps)
        )

    def test_char_len_matches_stored_document(self):
        """
        The char_len metadata field must equal len(document) for every chunk.

        Both are written during ingest from the same text string, but they are
        stored in two separate ChromaDB fields. A mismatch means one was written
        after the text was transformed (e.g. stripped differently), or the
        metadata was updated independently of the document.
        """
        col = _get_collection()
        total = col.count()
        sample_size = min(50, total)
        result = col.get(limit=sample_size, include=["documents", "metadatas"])

        mismatches: list[str] = []
        for i, (doc, meta) in enumerate(zip(result["documents"], result["metadatas"])):
            stored_len = meta.get("char_len")
            actual_len = len(doc) if doc is not None else None
            if stored_len is None or actual_len is None:
                continue
            if int(stored_len) != actual_len:
                mismatches.append(
                    f"chunk {result['ids'][i]}: "
                    f"char_len={stored_len} but len(doc)={actual_len}"
                )

        assert not mismatches, (
            f"{len(mismatches)} char_len mismatches:\n" + "\n".join(mismatches[:10])
        )

    def test_ingested_at_is_valid_iso8601(self):
        """
        Every chunk must carry an ingested_at field that is a valid ISO-8601
        UTC timestamp.

        A missing or malformed timestamp breaks any downstream tooling that
        filters chunks by recency (e.g. incremental reindex, audit logging).
        """
        import re

        ISO8601_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

        col = _get_collection()
        sample_size = min(30, col.count())
        result = col.get(limit=sample_size, include=["metadatas"])

        bad: list[str] = []
        for i, meta in enumerate(result["metadatas"]):
            ts = meta.get("ingested_at")
            if ts is None:
                bad.append(f"chunk {result['ids'][i]}: ingested_at missing")
            elif not ISO8601_UTC.match(str(ts)):
                bad.append(f"chunk {result['ids'][i]}: ingested_at={ts!r}")

        assert not bad, (
            f"{len(bad)} chunks with invalid ingested_at:\n" + "\n".join(bad[:10])
        )


class TestQuerySemantics:
    """
    Semantic correctness tests that validate embedding-space properties,
    not just API contracts.
    """

    def test_cross_trader_semantic_separation(self):
        """
        A T1-specific query must be semantically closer to T1 chunks than to T2
        chunks in the embedding space.

        If T1 and T2 content collapse to the same embedding region, the
        per-trader filename filter is the only thing preventing cross-talk —
        which means a missing filter would silently return wrong-persona answers.
        """
        T1_FILE = "t1-tactical-opportunist-100-questions.md"
        T2_FILE = "t2-structured-growth-investor-100-questions.md"

        col = _get_collection()
        emb = _embed_query(
            "How does a tactical opportunist trader use options for momentum entries?"
        )

        t1_result = col.query(
            query_embeddings=[emb],
            n_results=3,
            include=["distances"],
            where={"source_file": T1_FILE},
        )
        t2_result = col.query(
            query_embeddings=[emb],
            n_results=3,
            include=["distances"],
            where={"source_file": T2_FILE},
        )

        t1_dists = t1_result["distances"][0]
        t2_dists = t2_result["distances"][0]

        if not t1_dists:
            pytest.skip(f"No T1 chunks found — '{T1_FILE}' may not be ingested")
        if not t2_dists:
            pytest.skip(f"No T2 chunks found — '{T2_FILE}' may not be ingested")

        avg_t1 = sum(t1_dists) / len(t1_dists)
        avg_t2 = sum(t2_dists) / len(t2_dists)

        assert avg_t1 < avg_t2, (
            f"T1 query is not closer to T1 content than T2 content. "
            f"avg T1 dist={avg_t1:.4f}, avg T2 dist={avg_t2:.4f}. "
            "T1/T2 content may not be semantically distinct in embedding space."
        )

    def test_n_results_above_collection_size_does_not_raise(self):
        """
        Requesting n_results larger than the collection count must return at
        most collection_count results without raising an exception.

        ChromaDB caps n_results at the collection size. If this raises instead,
        a mis-configured RAG_TOP_K (e.g. set to 999) would crash every query.
        """
        col = _get_collection()
        total = col.count()
        oversized_n = total + 1000

        emb = _embed_query("What is swing trading?")
        try:
            result = col.query(
                query_embeddings=[emb],
                n_results=oversized_n,
                include=["distances"],
            )
        except Exception as exc:
            pytest.fail(
                f"collection.query raised with n_results={oversized_n} > count={total}: {exc}"
            )

        returned = len(result["ids"][0])
        assert returned <= total, (
            f"ChromaDB returned {returned} results but collection only has {total} chunks"
        )
        assert returned > 0, "Expected at least one result for oversized n_results"
