# ai-text-opt-1024: End-to-End Pipeline

Complete flow from frontend user input through chunking, embedding, and RAG retrieval to LLM response.

> **Monorepo layout** — two independent Next.js apps share the same ChromaDB collection and embed service:
> - `apps/trader-chat/` — trader persona UI (T1/T2), Gemini with tool-use, port 3002
> - `backend/` — general RAG backend, Gemini + Mistral, port 3001
> - `embed_service.py` — shared FastAPI embedding service, port 8001
> - `ingest.py` — offline ingestion pipeline (run once, or on doc changes)

---

## Overview

```
Markdown docs (../ai-text-opt/docs/trader-qa/*.md)
    │
    ▼
[1] Load .md files as plain UTF-8 text                    ingest.py
    │
    ▼
[2] File-aware chunk                                       ingest.py
      Q&A files  → SentenceSplitter(300t / 40ov)
      Prose files → SentenceSplitter(480t / 96ov)
      Drop stubs < 80 tokens
    │
    ▼
[3] Content-hash dedup                                     ingest.py
      sha1(text) vs data/ingest.checkpoint.json
      Skip unchanged chunks
    │
    ▼
[4] Pre-flight cost check (cloud mode only)                ingest.py
      Abort if projected write cost > CHROMA_BUDGET_SOFT
    │
    ▼
[5] Batch embed with "Passage: " prefix                    ingest.py
      intfloat/e5-large-v2 → 1024D float32, batch=32
    │
    ▼
[6] Upsert to {collection}_staging                         ingest.py
      batch=200, retry×3 with exp backoff
    │
    ▼
[7] Validate staging count ≥ expected                      ingest.py
      Staging IS the live collection
    │
    ▼
[8] Save checkpoint                                        ingest.py
      data/ingest.checkpoint.json
    │
    ▼ (offline pipeline complete)

─────── Runtime Query Path ───────────────────────────────────────────────────

User types query in browser (port 3002)                    page.tsx
    │
    ▼
POST /api/chat { message, trader }                         route.ts
    │
    ├──► embedQuery() ──► POST /embed { is_query:true } ──► embed_service.py:8001
    │                          "Query: " + text → 1024D vector
    │
    ├──► getCollection() ──► ChromaDB heartbeat
    │
    ▼ (both resolve in parallel)
collection.query({ queryEmbeddings, where: { source_file: $in [...] } })
    │
    ▼
Distance filter (≤ SCORE_THRESHOLD=0.75)
    │
    ▼
buildPrompt(query, ragResult)                              rag.ts
    │
    ▼
callLLM(prompt) ──► Gemini API (tool-use loop, max 5 turns)
    │
    ▼
JSON response { answer, sources, tool_calls, context_empty }
    │
    ▼
Chat UI + Sources sidebar                                  page.tsx
```

---

## Part 1: Query-Time Pipeline — `apps/trader-chat/`

### 1. Frontend: User Input (`apps/trader-chat/app/page.tsx`)

User interaction flow:
- Select trader profile: **T1** (Tactical Opportunist) or **T2** (Structured Growth Investor)
- Starter questions per persona; textarea auto-resizes to max 160px
- `sendMessage()` POSTs to `/api/chat` with `{ message: string, trader: "T1" | "T2" }`
- On success: renders assistant message + updates `SourcesPanel` with retrieved chunks
- On error: shows inline `⚠️` message with server error text

UI components:
- `components/ChatMessage.tsx` — renders user/assistant messages, tool call badges
- `components/SourcesPanel.tsx` — right sidebar listing retrieved source chunks with rerank scores
- `components/ToolCallBadge.tsx` — displays tool name + result inline in assistant message

### 2. API Route: Orchestration & Rate Limiting (`apps/trader-chat/app/api/chat/route.ts`)

Request flow:
1. **Rate limit by IP**: 60 requests per 60-second window (in-process `Map`, resets per window)
2. **Validate body**: `message` must be non-empty string; `trader` must be `"T1"` or `"T2"`
3. **RAG query**: `queryTrader(message, trader)` — returns context + source metadata
4. **Build prompt**: `buildPrompt(message, trader, ragResult)` — injects trader persona + context
5. **LLM call**: `callLLM(prompt)` — Gemini with tool-use loop
6. **Response**: return JSON

```typescript
// Response shape
{
  answer:        string,
  tool_calls:    ToolResult[],
  llm_provider:  "gemini",
  trader:        "T1" | "T2",
  sources: [{
    text_preview:  string,
    source_file:   string,
    chunk_index:   number,
    rerank_score:  number,   // = 1 - cosine_distance, higher is better
  }],
  context_empty: boolean,
}
```

Error handling:
- `ChromaUnavailableError` → HTTP 503 Service Unavailable
- All other errors → HTTP 500 Internal Server Error

Health check: `GET /api/health` (separate route at `app/api/health/route.ts`)

### 3. RAG Module (`apps/trader-chat/lib/rag.ts`)

#### `queryTrader(queryText, trader)`

Calls the internal `queryChroma()` function with a trader-scoped filter:

```typescript
where: { source_file: { $in: traderFiles[traderTag] } }
// T1 → ["t1-tactical-opportunist-100-questions.md"]
// T2 → ["t2-structured-growth-investor-100-questions.md"]
```

Note: Uses ChromaDB's `$in` array operator (not simple equality) — enables future multi-file support per trader.

#### `queryChroma(queryText, options)`

Core retrieval logic:
1. **Parallel dispatch**: `embedQuery()` and `getCollection()` run concurrently via `Promise.all()`
   — saves ~50–100 ms per request (collection heartbeat overlaps with embed network call)
2. **ChromaDB query**: fetches `["documents", "metadatas", "distances"]` (excludes raw embeddings — reduces payload ~4 KB/chunk)
3. **Distance filter**: drops chunks where `dist > SCORE_THRESHOLD` (default 0.75)
4. **Structured logging**: emits JSON log line per query:
   ```json
   { "event": "rag_query", "query_hash": "...", "top_k": 8, "n_returned": 5,
     "n_filtered_out": 3, "latency_ms": 42, "collection": "..." }
   ```

RAG defaults (trader-chat):
- `RAG_TOP_K=8`, `RAG_MAX_TOP_K=20`, `RAG_SCORE_THRESHOLD=0.75`

Returns:
```typescript
{
  context: string,      // chunks joined with "\n\n---\n\n"
  sources: RagSource[], // { text_preview, source_file, chunk_index, distance }
  empty:   boolean,     // true if no chunks survive the distance filter
}
```

#### `buildPrompt(query, trader, ragResult)`

Constructs the full LLM prompt with trader persona:
- **T1** persona: `"Tactical Opportunist (T1) — short-term, momentum-driven, options-heavy"`
- **T2** persona: `"Structured Growth Investor (T2) — long-term, fundamentals-first, disciplined sizing"`
- If `ragResult.empty`: falls back to knowledge-only prompt (no context block)
- If context available: embeds all retrieved chunks with an instruction to stay true to trader philosophy

### 4. Embed Service: Query-Time Embedding (`embed_service.py` on port 8001)

Shared by both `apps/trader-chat/` and `backend/`.

FastAPI singleton service:
- **Model**: `intfloat/e5-large-v2` — 1.47 GB on disk, 1024D output
- **Device**: auto-selects CUDA if available, falls back to CPU
- **Startup**: `@app.on_event("startup")` pre-warms the model; dimension verified against `EXPECTED_DIM=1024`
- **Singleton**: model loaded once, kept resident for process lifetime (re-loading = ~3s penalty)

`POST /embed`:
```json
// Request
{ "texts": ["user question"], "is_query": true }

// Response
{ "embeddings": [[float × 1024]], "dimension": 1024, "model": "intfloat/e5-large-v2" }
```

e5 asymmetric prefix logic (applied in service):
- `is_query=true` + e5 model → prepend `"Query: "` → query-side representation
- Ingest applies `"Passage: "` prefix at index time
- Mismatching the prefix at one side causes ~10–15% recall degradation

`GET /health` → `{ "status": "ok", "model": "...", "dimension": 1024 }`

Error responses:
- Empty `texts` list → HTTP 400
- Encoding exception → HTTP 500 with detail
- Dimension mismatch detected at startup → `RuntimeError` (kills the process)

### 5. Vector Store (`apps/trader-chat/lib/chroma.ts`)

ChromaDB client — configured via environment:

| Mode | Connection | When to use |
|------|-----------|-------------|
| `local` | `http://localhost:8000` | Dev, no cloud account needed |
| `cloud` | Chroma Cloud (API key + tenant + database) | Production, shared access |

Collection name is assembled dynamically:
```
{CHROMA_COLLECTION}_v{CHROMA_COLLECTION_VERSION}_staging
# Default: ideas_1024d_v2_staging
```

The `_staging` suffix is intentional — `ingest.py` writes to staging and validates before declaring it live. The backend queries staging directly because staging IS the live collection in practice.

HNSW index parameters (set at collection creation in `ingest.py`):
- `hnsw:space = cosine`
- `hnsw:construction_ef = 200` — higher recall during index build
- `hnsw:M = 32` — graph connectivity (higher = better recall, more memory)
- `hnsw:search_ef = 100` — query-time beam width

`getCollection()` workflow:
1. Lazy-init `ChromaClient` / `CloudClient` singleton
2. `client.heartbeat()` on every call — throws `ChromaUnavailableError` if unreachable
3. Returns `Collection` with `embeddingFunction: undefined` (vectors always pre-computed)

### 6. LLM Orchestration: Gemini with Tools (`apps/trader-chat/lib/llm.ts`)

Unlike the `backend/` LLM module, `apps/trader-chat` runs a **multi-turn tool-use loop**.

#### Tool Definitions (3 tools exposed to Gemini)

| Tool | Params | Status |
|------|--------|--------|
| `get_current_price` | `{ ticker: string }` | Stub — returns null; wire `MARKET_DATA_API_KEY` |
| `screen_stocks` | `{ trader_profile: "T1"\|"T2", criteria: string }` | Stub — returns empty candidates |
| `compare_traders` | `{ topic: string }` | Synthetic — Gemini synthesizes from RAG context |

#### Tool-Use Loop (max 5 turns)

```
1. POST to Gemini: { contents: [user prompt], tools: GEMINI_TOOLS }
2. Parse candidate.content.parts for functionCall blocks
3. If functionCalls exist:
   a. Execute each via executeTool(name, args) locally
   b. Append { role:"model", parts:[...] } + { role:"user", parts:[functionResponse...] }
   c. Re-POST to Gemini with updated contents
   d. Goto 2
4. Extract text from final candidate
5. Return { text, tool_calls: ToolResult[] }
```

Model: `GEMINI_MODEL` env var — default `gemini-2.5-flash` (overridable per deployment)

---

## Part 1b: `backend/` — General RAG Backend (Port 3001)

The `backend/` directory is a **separate Next.js app** (port 3001) sharing the same ChromaDB collection. It has a simpler LLM layer — no tool-use loop, supports two providers.

### LLM Layer (`backend/lib/llm.ts`)

Dispatches to Gemini or Mistral based on `LLM_PROVIDER` env var:

```typescript
// Gemini path
model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash"
// → POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent

// Mistral path
model = process.env.MISTRAL_MODEL ?? "mistral-small-latest"
// → POST https://api.mistral.ai/v1/chat/completions
```

Returns `Promise<string>` (plain text, no tool calls).

### RAG Layer (`backend/lib/rag.ts`)

Functionally similar to trader-chat RAG with two differences:
- `buildPrompt(query, ragResult)` — no `trader` param; generic trading assistant persona
- RAG defaults: `RAG_TOP_K=10`, `RAG_MAX_TOP_K=50` (wider retrieval window than trader-chat)
- `queryTrader()` still uses `$in` filter for T1/T2 file scoping

---

## Part 2: Ingest Pipeline (Offline — `ingest.py`)

Run once to populate ChromaDB. Re-run after document changes; unchanged chunks are skipped via deduplication.

### Step 1: Document Loading (lines 139–161)

**Source directory**: set via `DOCS_ROOT` env var (default: `../ai-text-opt/docs/trader-qa/`)

Loader:
- `sorted(docs_root.glob("*.md"))` — deterministic file order
- Read as UTF-8 plain text (no LlamaParse — saves $0.01/page API cost)
- Create `llama_index.core.Document` with `metadata={"source_file": path.name}`
- Skip empty files with `logger.warning`
- Log char count per file

### Step 2: File-Aware Chunking (lines 185–230)

`_is_qa_file(filename)` detects Q&A files by checking for any of:
```python
QA_PATTERNS = ("t1-", "t2-", "-qa.md", "-100-questions")
```

Splitter selection:
```python
# Q&A files — atomic question/answer units, stay compact
SentenceSplitter(chunk_size=300, chunk_overlap=40)

# Prose files — flowing narrative, use larger window
SentenceSplitter(chunk_size=480, chunk_overlap=96)
```

Why 480 for prose (not 512):
- e5-large-v2 truncates hard at 512 tokens
- `"Passage: "` prefix consumes ~2 tokens
- 480 + 2 = 482 ≤ 512 (safe headroom with no truncation)

Stub filter:
```python
if len(text) < MIN_CHUNK_TOKENS * 4:  # ~4 chars per English token
    short_skipped += 1
    continue
```
Lone headings and stray punctuation lines are dropped; they waste a write slot and pollute top-K results.

`Chunk` dataclass:
```python
@dataclass
class Chunk:
    chunk_id:     str    # "{sha1(source_file)}_{chunk_idx:05d}"
    text:         str    # Raw chunk text (no prefix applied yet)
    content_hash: str    # sha1(text) — dedup key
    source_file:  str    # e.g. "t1-tactical-opportunist-100-questions.md"
    chunk_index:  int    # Sequential index within file
    char_len:     int    # len(text)
    ingested_at:  str    # UTC ISO 8601
```

### Step 3: Content-Hash Deduplication (lines 115–135)

**Checkpoint file**: `data/ingest.checkpoint.json`

```python
checkpoint = load_checkpoint()  # Dict[chunk_id, content_hash]
new_chunks = [c for c in chunks if checkpoint.get(c.chunk_id) != c.content_hash]
```

- **Hash match** → chunk unchanged → skip embedding entirely
- **No entry or hash mismatch** → embed + upsert

Rules for cache invalidation:
- Editing document text → new `content_hash` → re-embeds that chunk only
- Changing `chunk_size` or `chunk_overlap` → different chunk boundaries → different `chunk_id`s → all chunks re-embed
- **Safest practice**: bump `CHROMA_COLLECTION_VERSION` whenever changing chunk params to land in a fresh collection and preserve the old one for rollback

### Step 4: Pre-Flight Cost Check (lines 89–110)

**Cloud mode only** (`CHROMA_MODE=cloud`).

```
cost = n_new_chunks × (1024 floats × 4 bytes + 200 bytes metadata) / 1 GB × $2.50/GB
```

Example: 10,000 chunks × 4,296 bytes = 0.040 GB × $2.50 = **$0.10**

Two budget thresholds (both in `.env`):
- `CHROMA_BUDGET_SOFT=5.00` — pre-flight abort (configurable)
- `CHROMA_BUDGET_HARD=20.00` — documented hard ceiling for any single operation

If `cost > CHROMA_BUDGET_SOFT`: raises `RuntimeError`, exits with code 1.

Local mode: check is skipped entirely (PersistentClient has no per-write cost).

### Step 5: Batch Embedding (lines 235–267, 423–441)

`EmbeddingModel` class:
```python
device = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
model = SentenceTransformer(model_name, device=device)
# Verify output dim == 1024 before proceeding
```

`_preprocess(text)`:
```python
if "e5" in self.model_name.lower():
    return f"Passage: {text}"  # required at index time for e5 models
return text
```

`encode_batch(texts)`:
- Batch size: `EMBEDDING_BATCH_SIZE` (default 32)
- Retry up to `MAX_BATCH_RETRIES=3` times with exponential backoff (`2^attempt` seconds)
- Progress shown via `tqdm`

Output: `np.ndarray` of shape `(n_chunks, 1024)` float32

### Step 6: Upsert to ChromaDB Staging (lines 314–350)

Destination collection: `STAGING_NAME = f"{COLLECTION_BASE}_v{COLLECTION_VERSION}_staging"`

Upsert batch loop:
```python
collection.upsert(
    ids=        [c.chunk_id for c in batch],
    documents=  [c.text for c in batch],
    embeddings= batch_embs.tolist(),          # pre-computed 1024D vectors
    metadatas=  [{
        "source_file":   c.source_file,
        "chunk_index":   c.chunk_index,
        "char_len":      c.char_len,
        "content_hash":  c.content_hash,
        "ingested_at":   c.ingested_at,
    } for c in batch],
)
```

- Batch size: 200 (balances network round-trips vs. payload size)
- Retry: up to 3 attempts, `2^attempt` second backoff
- Checkpoint is saved after each successful batch (not just at the end)

### Step 7: Validation & Staging Swap (lines 354–375)

```python
actual = staging.count()
assert actual >= expected_count  # expected = len(new_chunks)
```

ChromaDB has **no atomic rename**. The staging collection is therefore treated as the live collection directly. The `_staging` suffix serves as a signal (not a true staging/prod gate) that ingest writes here and validation has passed.

Rollback strategy: decrement `CHROMA_COLLECTION_VERSION` (e.g., `2` → `1`) and restart the Next.js backends. They will re-point to the previous versioned collection.

### Step 8: Checkpoint Save (lines 465–467)

```python
for chunk in new_chunks:
    checkpoint[chunk.chunk_id] = chunk.content_hash
save_checkpoint(checkpoint)   # writes data/ingest.checkpoint.json
```

The checkpoint is written atomically (full JSON rewrite) after the final validation. Chunks upserted in the last batch are confirmed before their hashes are recorded.

### Step 9: Post-Ingest Verification (`scripts/verify_ingest.py`)

Run separately after `ingest.py` to confirm health before starting the backend:

```bash
python scripts/verify_ingest.py
```

Checks performed:
1. **ChromaDB connection** — `PersistentClient` reaches the staging collection; `count > 0`
2. **Collection metadata** — `hnsw:space == "cosine"`, `embedding_dimension == "1024"`
3. **Embed service reachability** — `GET /health` returns 200 with `dimension == 1024`
4. **Self-match test** — 5 randomly sampled chunks are re-queried using their own stored embedding:
   - Each chunk must rank #1 in its own query
   - `top_dist < 0.05` (near-identical vectors confirm embedding integrity)

Output:
```
── Verification Suite ─────────────────────────────────────────
[1] ChromaDB collection
  [PASS] Collection reachable: 'ideas_1024d_v2_staging' count=500
  [PASS] Count > 0: 500 chunks

[2] Collection metadata
  [PASS] distance_metric == cosine: 'cosine'
  [PASS] embedding_dimension == 1024: '1024'

[3] Embed service
  [PASS] Embed service /health 200
  [PASS] Embed dimension == 1024: 1024

[4] Self-match test (5 random chunks)
  [PASS] All 5 self-match rank#1 with dist<0.05

── Result: 8/8 checks passed ─────────────────────────
```

---

## Configuration Reference

### Root `.env` (ingest + shared)

```bash
# ChromaDB
CHROMA_MODE=local                        # "local" | "cloud"
CHROMA_COLLECTION=ideas_1024d
CHROMA_COLLECTION_VERSION=2              # bump to roll forward to fresh collection
CHROMA_SERVER_URL=http://localhost:8000  # local mode only

# Cloud mode credentials (CHROMA_MODE=cloud only)
CHROMA_API_KEY=<your-chroma-api-key>
CHROMA_TENANT=<your-tenant-name>
CHROMA_DATABASE=<your-database-name>

# Cloud budget guardrails (cloud mode only)
CHROMA_BUDGET_SOFT=5.00                  # USD — abort if projected write exceeds this
CHROMA_BUDGET_HARD=20.00                 # USD — hard ceiling for any single operation

# Embedding (shared by ingest.py and embed_service.py)
EMBEDDING_MODEL=intfloat/e5-large-v2
EMBEDDING_BATCH_SIZE=32

# Chunking
PROSE_CHUNK_SIZE=480
PROSE_CHUNK_OVERLAP=96
QA_CHUNK_SIZE=300
QA_CHUNK_OVERLAP=40
MIN_CHUNK_TOKENS=80

# LLM
LLM_PROVIDER=gemini                      # "gemini" | "mistral"
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash            # optional override
MISTRAL_API_KEY=<your-mistral-api-key>   # required if LLM_PROVIDER=mistral
MISTRAL_MODEL=mistral-small-latest       # optional override

# RAG tuning (backend defaults — trader-chat overrides these)
RAG_TOP_K=10
RAG_MAX_TOP_K=50
RAG_SCORE_THRESHOLD=0.75

# Embed service
EMBED_SERVICE_URL=http://127.0.0.1:8001
```

### `apps/trader-chat/.env` (or root `.env`)

`apps/trader-chat` reads from the **monorepo root `.env`** — not its own directory.

Trader-chat-specific overrides:
```bash
RAG_TOP_K=8          # tighter than backend default (10)
RAG_MAX_TOP_K=20     # tighter than backend default (50)
GEMINI_MODEL=gemini-2.5-flash
```

---

## 20 Steps to Optimal Operation

Follow these in order for the most reliable, performant deployment:

### Environment Setup

**1. Copy and fill the root `.env`**
```bash
cp .env.example .env
# Fill: GEMINI_API_KEY (required)
# Fill: CHROMA_API_KEY + CHROMA_TENANT + CHROMA_DATABASE (if cloud mode)
```

**2. Create a Python virtual environment with all ingest dependencies in one command**
```bash
mamba create -n ai-text-opt python=3.11 \
  torch sentence-transformers llama-index chromadb \
  fastapi uvicorn httpx tqdm python-dotenv numpy -c conda-forge
mamba activate ai-text-opt
```
Install everything at once — mamba resolves the full dependency graph in a single pass.

**3. Verify GPU availability** (optional but 3–5× faster embedding)
```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```
If CPU only: set `EMBEDDING_BATCH_SIZE=16` to avoid out-of-memory during ingest.

**4. Start ChromaDB server** (local mode)
```bash
chroma run --path chroma_db
# Verify: curl http://localhost:8000/api/v1/heartbeat
```
Keep this running in a dedicated terminal or background process for both ingest and runtime.

### Ingest

**5. Run ingest — first pass will take 3–8 minutes** (model download + embedding)
```bash
python ingest.py
# Watch for: "Ingest complete: N chunks live in 'ideas_1024d_v2_staging'"
```
Subsequent runs on unchanged docs complete in seconds (deduplication skips all re-embedding).

**6. Run the verification suite immediately after ingest**
```bash
python scripts/verify_ingest.py
# Must pass all 8 checks before starting the backend
```
The self-match test catches embedding dimension mismatches and corrupted vectors before they reach production.

**7. Inspect the checkpoint** — confirm dedup is working on subsequent runs
```bash
python -c "import json; d=json.load(open('data/ingest.checkpoint.json')); print(f'{len(d)} chunks checkpointed')"
```

**8. When changing chunk parameters, always bump `CHROMA_COLLECTION_VERSION`**
```bash
# In .env:
CHROMA_COLLECTION_VERSION=3   # was 2
```
This lands in `ideas_1024d_v3_staging`, keeping the v2 collection intact as a rollback target. Never edit chunk sizes without bumping — the old checkpoint hashes will falsely indicate "unchanged."

### Embed Service

**9. Start the embed service in its own terminal**
```bash
uvicorn embed_service:app --host 127.0.0.1 --port 8001
# Wait for: "Model ready: 1024D verified"
```
The model loads ~3s on first request. The `@app.on_event("startup")` hook pre-warms it so the first query isn't penalized.

**10. Confirm embed service health before starting any backend**
```bash
curl -s http://127.0.0.1:8001/health | python -m json.tool
# Expected: { "status": "ok", "model": "intfloat/e5-large-v2", "dimension": 1024 }
```

**11. Test an embed round-trip manually**
```bash
curl -s -X POST http://127.0.0.1:8001/embed \
  -H "Content-Type: application/json" \
  -d '{"texts":["how does T1 trade earnings?"],"is_query":true}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print('dim:', d['dimension'], 'first3:', d['embeddings'][0][:3])"
# Expected: dim: 1024  first3: [0.02..., -0.01..., 0.04...]
```

### Backend / Trader-Chat

**12. Install Node dependencies**
```bash
cd apps/trader-chat && npm install
# or for the standalone backend:
cd backend && npm install
```

**13. Verify `GEMINI_API_KEY` is set and valid**
```bash
cd apps/trader-chat
grep GEMINI_API_KEY ../../.env
```
The API route will return HTTP 500 with `"GEMINI_API_KEY is not set"` if missing — verify before the first request.

**14. Start trader-chat app**
```bash
cd apps/trader-chat
npm run dev
# Runs on http://localhost:3002 (not 3000)
```

**15. Start the backend** (if using the separate RAG backend)
```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

**16. Open the UI and run a smoke test per trader persona**
- Navigate to `http://localhost:3002`
- Send a T1 starter question (e.g., "How does T1 trade earnings plays?")
- Confirm: answer appears, Sources panel shows chunks from `t1-tactical-opportunist-100-questions.md`
- Switch to T2 — confirm sources now show `t2-structured-growth-investor-100-questions.md`

### Tuning & Monitoring

**17. Read the structured JSON logs to diagnose retrieval quality**
```bash
# In the Next.js terminal, look for lines like:
{"event":"rag_query","query_hash":"a1b2c3d4","top_k":8,"n_returned":5,
 "n_filtered_out":3,"latency_ms":38,"collection":"ideas_1024d_v2_staging"}
{"event":"embed_query","latency_ms":22,"dimension":1024}
```
`n_filtered_out` consistently high → loosen `RAG_SCORE_THRESHOLD` (e.g., `0.75` → `0.80`).
`n_returned` always at `top_k` → tighten threshold or check for noisy chunks.

**18. Tune `RAG_SCORE_THRESHOLD` and `RAG_TOP_K` for your doc set**

| Symptom | Adjustment |
|---------|-----------|
| Answers too generic / "no context found" | Lower `RAG_SCORE_THRESHOLD` (e.g., 0.75 → 0.70) |
| Answers contain irrelevant chunks | Raise `RAG_SCORE_THRESHOLD` (e.g., 0.75 → 0.80) |
| Answers miss multi-part questions | Raise `RAG_TOP_K` (e.g., 8 → 12) |
| Gemini context too long, slow | Lower `RAG_TOP_K` (e.g., 8 → 5) |

Restart the Next.js dev server after changing any env var (`.env` is read at boot).

**19. For cloud ChromaDB: monitor write costs before any large re-ingest**
```bash
# Estimate before running:
python -c "
n=500; dims=1024; bytes_per=(dims*4)+200
gb=n*bytes_per/(1024**3); cost=gb*2.50
print(f'{n} chunks → \${cost:.4f}')
"
```
Always set `CHROMA_BUDGET_SOFT` before running `ingest.py` in cloud mode.

**20. Rollback procedure if a bad ingest degrades recall**
```bash
# Step 1: In .env, decrement CHROMA_COLLECTION_VERSION
CHROMA_COLLECTION_VERSION=1   # back to previous good version

# Step 2: Restart both Next.js apps — they will re-point to v1 collection
# apps/trader-chat: Ctrl+C → npm run dev
# backend: Ctrl+C → npm run dev

# Step 3: Verify the old collection is still healthy
python scripts/verify_ingest.py   # update CHROMA_COLLECTION_VERSION in env first

# Step 4: Investigate the bad v2 ingest separately, re-run when fixed
```

---

## Startup Order

Services must start in this order (each depends on the previous):

```
1. ChromaDB server          chroma run --path chroma_db
2. Run ingest               python ingest.py
3. Verify ingest            python scripts/verify_ingest.py
4. Embed service            uvicorn embed_service:app --host 127.0.0.1 --port 8001
5. Trader-chat app          cd apps/trader-chat && npm run dev   (port 3002)
   or backend               cd backend && npm run dev             (port 3001)
```

---

## Key Optimizations

**No external embedding API calls at query time**
Pre-computed 1024D vectors are stored in ChromaDB. Query-time embedding is a single local HTTP call to `embed_service.py` — no Voyage, OpenAI, or Cohere charges per query.

**Content-hash deduplication**
`sha1(chunk_text)` is compared against `data/ingest.checkpoint.json` before embedding. On a stable doc corpus, 100% of chunks are skipped on re-runs. Only changed or new chunks touch the GPU.

**Parallel embed + heartbeat**
`Promise.all([embedQuery(), getCollection()])` overlaps the embed service round-trip with the ChromaDB heartbeat check, saving 50–100 ms per request.

**File-aware chunk sizing**
Q&A files use smaller chunks (300 tokens) for tight retrieval precision. Prose files use larger chunks (480 tokens) up to the e5 model's 512-token hard limit. Stubs under 80 tokens are dropped to keep the index clean.

**`$in` metadata filter**
Trader-scoped queries use ChromaDB's `$in` operator rather than equality, enabling future expansion to multiple source files per trader without changing the query interface.

**Atomic staging with version-based rollback**
All writes land in `{collection}_v{version}_staging`. Decrementing `CHROMA_COLLECTION_VERSION` and restarting the backends instantly rolls back to a previous working collection — no data migration, no downtime.

**Asymmetric e5 prefixes**
`"Passage: "` applied at ingest, `"Query: "` applied at query time (in embed service). Required by the e5 fine-tuning objective. Omitting either prefix causes ~10–15% recall degradation.

---

## Troubleshooting

### ChromaDB connection refused
```
ChromaDB heartbeat failed (mode=local): connect ECONNREFUSED 127.0.0.1:8000
```
Start the server: `chroma run --path chroma_db`

### Embed service not reachable
```
Embed service error 500: Connection refused
```
Start the service: `uvicorn embed_service:app --host 127.0.0.1 --port 8001`
Check it's fully loaded: `curl http://127.0.0.1:8001/health`

### Model dimension mismatch
```
RuntimeError: Model intfloat/e5-large-v2 produces 768D; expected 1024D
```
`e5-base-v2` outputs 768D; `e5-large-v2` outputs 1024D. Verify `EMBEDDING_MODEL=intfloat/e5-large-v2` in `.env`.

### CUDA out of memory during ingest
```
RuntimeError: CUDA out of memory
```
Lower `EMBEDDING_BATCH_SIZE` (32 → 16 → 8) until it fits in VRAM.

### Empty RAG context on every query (`context_empty: true`)
Possible causes:
1. ChromaDB collection empty — run `ingest.py`
2. Score threshold too tight — lower `RAG_SCORE_THRESHOLD` (e.g., 0.75 → 0.65)
3. Wrong collection version — confirm `CHROMA_COLLECTION_VERSION` matches ingest
4. Wrong `source_file` metadata — run `verify_ingest.py` check 2

### Ingest checkpoint not found, all chunks re-embedding
```
Could not load checkpoint; starting fresh
```
First run is expected. Ensure `data/` directory is writable. If checkpoint corrupted, delete it and re-run — all chunks will re-embed once cleanly.

### `GEMINI_API_KEY is not set` on first chat request
The root `.env` is not being loaded. Confirm `.env` exists two levels up from `apps/trader-chat/` (at repo root), or set the key directly in `apps/trader-chat/.env`.

---

## Architecture Decisions

**Why `intfloat/e5-large-v2` (1024D)?**
Asymmetric fine-tuning for retrieval (query-passage pairs) gives strong recall without an external API. 1024D balances representational richness with storage cost (4 KB per vector in ChromaDB). The `large` variant outperforms `base` (768D) and `small` on MTEB retrieval benchmarks.

**Why `SentenceSplitter` (llama_index)?**
Respects sentence and paragraph boundaries rather than cutting mid-sentence. Configurable overlap preserves inter-sentence context across chunk boundaries. Handles edge cases (abbreviations, quotes, numbered lists) that naive fixed-window splitters miss.

**Why cosine distance?**
e5 embeddings are L2-normalized (unit vectors) — cosine similarity equals dot product on unit vectors, making it equivalent to Euclidean distance on the unit sphere. HNSW with cosine space is well-optimized and directly interpretable: distance 0.0 = identical, 1.0 = orthogonal.

**Why ChromaDB over Pinecone/Weaviate?**
Free local tier (no account required for development), pay-as-you-go cloud tier with straightforward pricing. Pre-computed vector support means Chroma never calls an external embedding API. Single-collection model is simpler than multi-index alternatives for this use case.

**Why Gemini 2.5 Flash (not GPT-4 or Claude)?**
Native function calling with multi-turn tool-use loop. Flash model optimized for low latency. Cost-effective for the chat + tool-loop pattern. Mistral is available as a drop-in fallback via `LLM_PROVIDER=mistral`.

**Why staging-as-live (no true atomic swap)?**
ChromaDB's Python client has no `rename_collection` API. The `_staging` suffix provides a naming convention that distinguishes ingest-target collections from a hypothetical future "live" namespace — and enables rollback by version number without touching the collection data.

---

## Future Improvements

- **Real market data**: Wire `get_current_price` to Yahoo Finance, Polygon.io, or Alpaca
- **Live screener**: Connect `screen_stocks` to a real stock universe with fundamental + technical filters
- **BM25 + reranking**: Hybrid sparse-dense retrieval with a cross-encoder reranker (e.g., Cohere Rerank 3) for higher precision
- **Query embedding cache**: LRU cache for repeated or near-duplicate queries (saves embed service round-trip)
- **Multi-file traders**: Expand `traderFiles` to arrays and use `$in` filter for richer per-trader knowledge bases
- **Conversation history**: Pass previous turns to Gemini for multi-turn context-aware answers
- **Analytics**: Structured log aggregation (n_returned, latency, tool invocations) to identify retrieval gaps
- **Automated re-ingest**: Watch `DOCS_ROOT` for file changes and trigger incremental ingest automatically
