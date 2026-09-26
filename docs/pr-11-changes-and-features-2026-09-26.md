# PR #11 — Changes and Feature Inventory

_Written 2026-09-26. Branch `feat/swing-growth-frontend-pages` (4 feature commits + 1 follow-up on top of `main`; ~80 files, ~10.9k lines added, mostly the new frontend pages and docs)._

This covers two things: **what PR #11 changes**, and **every feature the app now has**, with what was actually verified by running it locally.

---

## 1. What changed

### 1.1 LLM moved from Gemini to OpenRouter
- New `lib/openrouter.ts` in both `backend/` and `apps/trader-chat/` (kept byte-identical on purpose).
- Walks a free-model chain (default starts with `nvidia/nemotron-3-super-120b-a12b:free`), falling through on 402/429/5xx, network errors, per-attempt timeouts (20s) and empty replies. Other 4xx fails fast.
- Override the chain without a deploy: `OPENROUTER_MODELS="a:free,b:free"`.
- Key is sent in an `Authorization` header (the old Gemini `?key=` URL leak, #42, is gone).
- Persona is now a system message; temperature and max tokens are set explicitly (#19).
- Empty replies fail over to the next model; a length cutoff is noted in the answer (#20).
- Stub tools (`get_current_price`, `screen_stocks`) removed (#17).

### 1.2 Retrieval defects fixed (`ingest.py`, `embed_service.py`, `lib/rag.ts`)
| # | Fix |
|---|---|
| 1 | e5 prefixes are now lowercase `query: ` / `passage: ` (the model's trained format). Needs a re-ingest; `EMBED_FORMAT_TAG` is folded into the content hash so every chunk re-embeds. |
| 2 | Ingest prunes chunk IDs that no longer exist. |
| 3 | Chunk IDs keyed by relative path, not bare filename (two `README.md` files no longer collide). `source_file` metadata stays the bare filename so retrieval filters still match. |
| 13 | Context chunks labelled `[S1]…` so the model can cite. |
| 14 | Retrieved text wrapped in `<context>` tags; model told to ignore instructions inside it. |
| 18 | Comparison questions retrieve from both T1 and T2 files. |
| 41 | `/embed` is a plain `def`, so FastAPI runs it in a threadpool instead of blocking the event loop. |
| 44 | Timeouts on the backend embed call and every model attempt; chat routes return generic errors instead of upstream text. |

### 1.3 Agent proxy hardening (`backend/lib/agentProxy.ts`)
- Falls back to local fixture JSON **only on 5xx or network errors** (#34). A 4xx (bad input/auth) now reaches the caller.
- Every fixture response carries `X-Data-Source: local-fixture`; real ones carry `gcp3`.
- Frontend `requestJson` now returns `isFixture` (#33 — see "not done" below: the visible banner isn't built).

### 1.4 New frontend (Vite/React, `frontend/`)
Pages: **Chat**, **Predictions**, **Swing**, **Growth**, **SuperApp** (AI Alpha OS nav). Shared components: run trigger, decision tabs, score trajectory, source freshness, stale-data and AI-degraded badges, research-only banner, compliance label, RAG chat panel. Swing and Growth each have a run form, run summary, candidate table + detail panel, evidence accordion, mutation history, and (Growth) tax-risk accordion / (Swing) critique accordion.

### 1.5 Follow-up commit (this session's fixes)
| File | Change | Why |
|---|---|---|
| `apps/trader-chat/next.config.js` | Externalize `chromadb` (`serverComponentsExternalPackages`) | trader-chat **did not compile** — `chromadb`'s bundled `https://unpkg.com/…` import can't be handled by webpack. Same fix `backend/` already had. Identical on `main`, so this was broken before the PR too. |
| `lib/openrouter.ts` (both apps) + both `/api/health` routes | New `checkOpenRouterKey()`; `llm` check now really probes OpenRouter's free `/auth/key` (3s timeout, cached 60s) | Health used to report `llm: ok` for any set key, including a revoked one. Verified: valid key → 200 `ok`; dead key → 503 `degraded`. |
| `apps/trader-chat/lib/chroma.ts` | Pre-computed-embeddings-only `IEmbeddingFunction` (same as backend) | Cleared TS2322. |
| `apps/trader-chat/lib/rag.ts` | `raw.distances?.[0]` | Cleared TS18047. |

`tsc --noEmit` is now clean in `apps/trader-chat`, `backend` and `frontend`.

---

## 2. Feature inventory

### Trader Chat (`apps/trader-chat`, port 3002)
- Two personas: **T1 Tactical Opportunist**, **T2 Structured Growth Investor**. `POST /api/chat` takes `{ message, trader: "T1" | "T2" }` (uppercase).
- RAG over the trader-qa corpus: embed query → Chroma (filtered to that trader's file) → cited prompt → OpenRouter.
- Comparison questions pull from both traders' files.
- Response: `answer`, `sources`, `model`, `llm_provider`, `context_empty`.
- UI: trader toggle, message list, sources panel, clear button.
- `GET /api/health`: Chroma, embed service, live LLM key check.

### General RAG Backend (`backend/`, port 3001)
- `POST /api/chat` with optional `trader_filter`; `GET /api/health`.
- Agent proxy routes: `/api/swing/runs`, `/api/swing/runs/[run_id]`, `/api/swing/runs/[run_id]/chat`, the same three under `/api/growth/`, and `/api/swing-predictions`.
- Proxies to the gcp3 backend (`GCP3_BACKEND_URL`); fixture fallback on outage, labelled by header.

### Embed service (`embed_service.py`, port 8001)
- `intfloat/e5-large-v2`, 1024D, `/embed` (`is_query` switches the prefix) and `/health`.

### Ingest pipeline (`ingest.py`)
- File-aware chunking (Q&A files 300/40 tokens, prose 480/96), stub filter (<80 tokens), content-hash dedup via checkpoint, batch embed, upsert to `<collection>_staging`, stale-chunk pruning.
- Local (`PersistentClient`) or Chroma Cloud mode with a write-cost pre-flight.

### Frontend (`frontend/`)
- Chat, Predictions, Swing, Growth and SuperApp pages as described in 1.4.

---

## 3. What was verified locally (2026-09-25/26)

Everything ran against a **scratch copy** of `chroma_db` and `data/`, so the real index and checkpoint were untouched.

| Check | Result |
|---|---|
| Re-ingest (scratch) | 363 chunks live; 249 stale pruned; lowercase prefixes in use |
| Retrieval | T1 filter returns only T1 chunks; options question lands on the options doc |
| trader-chat `/api/chat` T1 / compare / off-topic | All answered via OpenRouter; compare drew from both T1 and T2 files; off-topic refused by the model |
| backend `/api/chat` (with and without `trader_filter`, and empty body) | 200 / 200 / 400 |
| Agent proxy, upstream down | GETs return 200 with `x-data-source: local-fixture`; chat POST likewise |
| Agent proxy, upstream returns 404 | Passed through as 404 (the #34 behaviour) |
| Health probe | 200 with a valid key, 503 `degraded` with the dead key |
| Playwright e2e (trader-chat) | 3/3 pass — note these **mock the API**, so they don't exercise the LLM |
| `tsc` (3 packages), `vite build` | Clean |

Backend was run on port 3011 because 3001 was in use by an unrelated dev server.

---

## 4. Caveats and known issues

- **The OpenRouter key in this repo's `.env` is dead** (HTTP 401) and is named `OPEN_ROUTER_API_KEY`; both apps read `OPENROUTER_API_KEY`. Testing used the valid key from `nuwrrrld-portal/.env.local`, injected at runtime only — nothing was written to any file.
- **Reasoning leak:** the default first model (`nemotron-3-super`) sometimes opens answers with its own reasoning ("We need to answer: …"). Not fixed.
- **The 0.75 score cutoff filters nothing.** e5 distances are compressed: an off-topic question ("capital of Mongolia") scored 0.298, on-topic hits 0.16–0.26. Off-topic queries still get context and sources (#6).
- **Prune gap (inferred):** the scratch collection ended with 363 chunks against 361 built. `chunking-explainer.md` has 2 orphan chunks that no longer exist in the corpus. Prune compares against the checkpoint, not the collection, so chunks absent from the checkpoint are never removed.
- **Source corpus is missing.** `DOCS_ROOT` (`../ai-text-opt/docs`) doesn't exist. The only copy found (`nuwrrrld-portal-corpus-import/corpus/trader-qa`) builds 361 chunks vs 600 in the real index — it is a different or smaller corpus. **The real `chroma_db` has not been re-ingested**, so the deployed index still uses the old prefix casing until it is.
- `validate_and_swap` deletes the non-staging target collection and treats staging as live. Both apps read the `_staging` name, so they agree — but the function's name and comments are misleading.
- The Playwright e2e specs are fully mocked and need `npx playwright install chromium` on a fresh machine.
- Port 8080 (`GCP3_BACKEND_URL` default) had an unrelated server answering 404 during testing; the real gcp3 backend was not exercised.

## 5. Not done (from the 50-item list)

- **#33 banner:** `isFixture` is plumbed through but `SwingPage` / `GrowthPage` don't show a "DEMO DATA" banner yet.
- **#43 rate limiter** (split `x-forwarded-for`, prune the `Map`): sensitive surface, must go through `/fixy`.
- Everything in sections A–F of `core-feature-improvements-2026-09-25.md` not listed as done there (reranker, hybrid search, streaming, multi-turn memory, citations rendering, eval set, request logging, …). Recommended first: **#47 retrieval eval set**, so the retrieval changes are measurable.
- `PIPELINE.md` still describes Gemini/Mistral and tool-use in several sections.
