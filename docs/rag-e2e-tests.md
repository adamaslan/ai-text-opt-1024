# RAG End-to-End Test Suite

`tests/test_rag_e2e.py` verifies the full retrieval stack — from embed service through ChromaDB query — without touching the LLM layer.

---

## Why these tests exist

The ingest pipeline and the runtime query path are two separate processes. Unit tests on either side don't catch mismatches between them: wrong embedding prefix, a missing metadata field, or a collection that accepted writes but produces garbage distances. These e2e tests close that gap by running an actual embed + query round-trip against the live collection.

---

## What is tested

### `TestCollectionHealth`

Checks the collection is ready before any query is attempted.

| Test | What it asserts |
|---|---|
| `test_collection_is_non_empty` | `collection.count() > 0` — fails loudly if ingest was never run |
| `test_collection_metadata_cosine` | `hnsw:space == "cosine"` — wrong metric produces meaningless distances |
| `test_collection_metadata_dimension` | `embedding_dimension == "1024"` — guards against a model swap silently changing vector size |

### `TestEmbedService`

Verifies the embed service contract independently of ChromaDB.

| Test | What it asserts |
|---|---|
| `test_health_returns_1024d` | `GET /health` returns 200 and `dimension == 1024` |
| `test_embed_query_shape` | A query string produces a 1024-element list |
| `test_embed_document_shape` | `is_query=False` (passage mode) also returns 1024D |

### `TestRagQueryE2E`

Runs embed → ChromaDB query end-to-end and validates every part of the response.

| Test | What it asserts |
|---|---|
| `test_generic_query_returns_results` | At least one chunk returned for a broad query |
| `test_distances_are_valid_cosine` | All distances in `[0.0, 2.0]` (the valid range for cosine distance) |
| `test_top_result_within_threshold` | Top-1 distance ≤ `RAG_SCORE_THRESHOLD` (0.75) — the same filter applied in `rag.ts` |
| `test_results_have_required_metadata_fields` | Every chunk carries `source_file`, `chunk_index`, `char_len` |
| `test_t1_file_filter` | `where={source_file: t1-...}` returns only T1 chunks |
| `test_t2_file_filter` | `where={source_file: t2-...}` returns only T2 chunks |
| `test_results_are_ranked_by_distance` | Results are in ascending distance order |
| `test_documents_are_non_empty_strings` | No null or whitespace-only document text |
| `test_cloud_collection_count_matches_expectation` | Cloud collection has ≥ 100 chunks (cloud marker only) |

---

## Markers

Two custom markers control which tests run in which environment.

```
e2e    — requires a populated ChromaDB collection (run ingest.py first)
cloud  — additionally requires CHROMA_MODE=cloud + CHROMA_API_KEY/TENANT/DATABASE
```

Run only the local subset (safe in any CI):

```bash
pytest tests/test_rag_e2e.py -v -m "e2e and not cloud"
```

Run everything including cloud assertions:

```bash
CHROMA_MODE=cloud pytest tests/test_rag_e2e.py -v -m "e2e"
```

---

## Skip conditions

The tests skip rather than fail when infrastructure is absent, so they don't block local development without a running embed service or cloud credentials.

| Condition | Behavior |
|---|---|
| `CHROMA_MODE=cloud` but no credentials | `pytest.skip` — not an error |
| Embed service unreachable | `pytest.skip` — individual tests that need it |
| Collection missing (never ingested) | `pytest.fail` — this is always a real error |

---

## CI integration

The `verify` job in [`.github/workflows/ingest-verify.yml`](../.github/workflows/ingest-verify.yml) runs the local subset after every ingest:

```
ingest.py → verify_ingest.py → pytest -m "e2e and not cloud"
```

The `rag-e2e-cloud` job runs the full suite against the live cloud collection, but only when `CHROMA_API_KEY` is available as a repository secret (fork PRs skip it automatically).

---

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `CHROMA_MODE` | `local` | `local` uses `chroma_db/`; `cloud` uses Chroma Cloud |
| `CHROMA_COLLECTION` | `ideas_1024d` | Collection base name |
| `CHROMA_COLLECTION_VERSION` | `2` | Combined with base: `ideas_1024d_v2_staging` |
| `EMBED_SERVICE_URL` | `http://127.0.0.1:8001` | Where the FastAPI embed service listens |
| `RAG_SCORE_THRESHOLD` | `0.75` | Must match the value in `rag.ts` |
| `RAG_TOP_K` | `8` | Number of results requested per query |
| `CHROMA_API_KEY` | — | Required for cloud mode |
| `CHROMA_TENANT` | — | Required for cloud mode |
| `CHROMA_DATABASE` | — | Required for cloud mode |

---

## Running locally

```bash
# 1. Ingest docs (one-time, or after doc changes)
python ingest.py

# 2. Start the embed service in the background
uvicorn embed_service:app --host 127.0.0.1 --port 8001 &

# 3. Run the local e2e suite
pytest tests/test_rag_e2e.py -v -m "e2e and not cloud"
```
