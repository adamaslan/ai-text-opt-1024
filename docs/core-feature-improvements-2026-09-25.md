# 50 Ways to Improve ai-text-opt-1024's Core Features

_Written 2026-09-25 after reading the RAG path (ingest → embed service → ChromaDB → prompt → Gemini), both chat routes, the agent proxy, and the Swing/Growth frontend._

**✱ = defect confirmed in the code.** The rest are improvements. Items are ordered by impact within each section.

## Where to start

- **#1–3:** these silently corrupt retrieval. Do them together with one re-ingest.
- **#33–34:** fixture data can currently look like live data.
- **#47:** it's cheap, and it tells you whether the rest of the retrieval changes actually help.
- **Quick wins:** #17, #41 and #42 are small changes you could ship in an afternoon.

---

## A. Retrieval quality

1. ✱ **Use lowercase e5 prefixes.** The e5 model was trained on `query: ` and `passage: `, but the code sends `Query: ` / `Passage: ` ([embed_service.py:953](../embed_service.py#L953), [ingest.py:253](../ingest.py#L253)). This quietly lowers recall on every query. The fix needs a re-ingest, so bump `CHROMA_COLLECTION_VERSION` at the same time.
2. ✱ **Delete chunks that no longer exist.** Ingest only upserts. When a doc shrinks or a file is removed, its old chunk IDs stay in the collection and keep getting retrieved. Diff the checkpoint IDs against the current IDs and delete the ones that are gone.
3. ✱ **Key chunks by relative path, not filename.** `rglob` is recursive, but `source_file = path.name` ([ingest.py:155](../ingest.py#L155)). Two `README.md` files in different folders get the same `file_hash`, so their chunk IDs overwrite each other.
4. **Add a real reranker.** The UI says "rerank_score", but it's just `1 - distance`. Fetch the top 20, rerank with a cross-encoder (e.g. `bge-reranker-base` in the embed service), and keep the top 5.
5. **Hybrid search.** Mix BM25 or keyword matching with vector search. Tickers, option terms and acronyms like "IV rank" or "CSP" are exactly where dense embeddings do badly.
6. **Replace the fixed 0.75 distance cutoff.** Use a relative cutoff (within X of the best hit) or a floor tuned per corpus. A fixed cosine cutoff either lets in noise or returns nothing, depending on the query.
7. **Chunk Q&A files by question, not by token count.** The trader files contain 100 questions each, so one question plus its answer is a natural chunk. Splitting at 300 tokens can separate a question from its answer.
8. **Store headings and question text as metadata** and prepend them to each chunk before embedding. This gives short chunks context.
9. **Rewrite the query before embedding.** Expand short or ambiguous questions ("what about NVDA?") using the chat history.
10. **MMR or dedup across overlapping chunks.** With 96-token overlap, the top-k often contains near-duplicate text that uses up context.
11. **Cache query embeddings** with a small LRU keyed by the normalized query text, so starter questions and repeats skip the embed call.
12. **Include recency and freshness in retrieval.** `ingested_at` is stored but never used. Surface it and optionally down-weight stale docs.

## B. Answer generation

13. **Label chunks in the prompt and require citations.** Context is currently joined with `---` and no source IDs, so the model can't cite. Emit `[S1] (file#chunk)` blocks and ask for `[S1]`-style citations.
14. **Delimit retrieved text as data.** Wrap it in tags and tell the model to ignore instructions inside it. This is basic protection against prompt injection from docs.
15. **Add multi-turn memory.** Both chat routes are single-turn: `{message}` only. Send the last N turns so follow-up questions work.
16. **Stream responses** with Gemini's `streamGenerateContent` and SSE to the UI. Right now the user waits for the whole tool loop to finish.
17. ✱ **Stop offering tools that do nothing.** `get_current_price` and `screen_stocks` return null or empty stubs ([apps/trader-chat/lib/llm.ts:194](../apps/trader-chat/lib/llm.ts#L194)). Either wire them to the gcp3 backend or Finnhub, or remove them from `GEMINI_TOOLS`. At the moment the model spends turns on them and then apologizes.
18. ✱ **Make `compare_traders` actually compare.** The RAG query is filtered to one trader's file, so a comparison never sees the other trader's context. When this tool fires, retrieve from both files.
19. **Use Gemini's `systemInstruction` field** for the persona instead of putting it in the user turn. Set `temperature` and `maxOutputTokens` explicitly.
20. ✱ **Handle blocked or empty responses.** When `finishReason` is SAFETY, MAX_TOKENS or RECITATION, the answer comes back as `""` with no explanation. Detect these cases and tell the user.
21. **Add a provider fallback in trader-chat.** The backend already supports Mistral; trader-chat is Gemini-only. On a 429 or 5xx, fall back instead of failing.
22. **Put more than a disclaimer on the empty-context path.** When nothing clears the threshold, trader-chat still answers from general knowledge. Show a visible "not grounded in the knowledge base" badge, as the run chat already does.

## C. Chat UX

23. **Render citations inline** in trader-chat: clickable `[S1]` links that scroll the Sources panel to that chunk.
24. **Persist conversations** in localStorage or a DB, with a "new chat" button, so a refresh doesn't wipe the thread.
25. **Stop and regenerate buttons**, plus copy-answer.
26. **Thumbs up/down per answer, with a reason.** Log it together with the retrieved chunk IDs; this becomes the eval dataset (see #47).
27. **Mid-conversation T1/T2 toggle with a side-by-side compare view.** This is the product's main idea, so give it its own UI.
28. **Show retrieval confidence** as a strong/weak/none match meter instead of raw scores.
29. **Suggest follow-up questions** after each answer, generated from adjacent chunks.
30. **Markdown and table rendering** in `ChatMessage`, with tickers auto-linked to the Swing/Growth candidate panels.
31. **Share the chat component.** `ChatMessage` and `SourcesPanel` are duplicated between `apps/trader-chat` and `frontend/`; extract one shared package.
32. **Accessibility:** focus management after sending, `aria-live` on streaming output, and keyboard submit (Enter to send, Shift+Enter for a newline).

## D. Swing/Growth runs and the agent proxy

33. ✱ **Show when data is fake.** `proxyAgentJson` falls back to fixture JSON on any failure and sets `X-Data-Source: local-fixture`, but [http.ts](../frontend/src/lib/api/http.ts) never reads that header. The UI can present fixture candidates and fixture chat answers as live. For a finance app this matters most on the list: show a "DEMO DATA" banner.
34. ✱ **Only fall back to fixtures on network errors or 5xx.** Today a 400 or 401 (bad input or bad auth) also returns fixture data, which hides real errors ([backend/lib/agentProxy.ts:779](../backend/lib/agentProxy.ts#L779)).
35. **Poll run status after triggering.** `triggerFixture` returns `queued`. Add a status endpoint, poll it or push updates over SSE, and auto-refresh when the run completes.
36. **Diff runs over time:** which candidates entered or left, and how scores moved. `ScoreTrajectory` already exists; make it compare across runs.
37. **Candidate watchlists and alerts:** pin tickers and get notified when a later run changes their decision.
38. **Export** a run's candidates, evidence and critique as CSV or PDF.
39. **Deep-link to state.** Put run ID, selected candidate and open tab in the URL so views can be shared or bookmarked.
40. **Validate proxy payloads** with zod schemas that match `types/swing.ts` and `types/growth.ts`, so gcp3 schema drift fails visibly instead of rendering `undefined`.

## E. Reliability, security, performance

41. ✱ **Stop blocking the event loop in `/embed`.** It's an `async def` that calls the synchronous `model.encode` ([embed_service.py:957](../embed_service.py#L957)), so concurrent queries run one at a time. Make it a plain `def` (FastAPI then runs it in a threadpool) or use `run_in_threadpool`.
42. ✱ **Move the Gemini API key into a header.** It's in the URL query string (`?key=`), where it can end up in proxy and error logs. Use the `x-goog-api-key` header.
43. ✱ **Fix the rate limiter.** The backend keys on the full `x-forwarded-for` header without splitting it, so a client can bypass it by varying the header. In both apps the `Map` is never pruned, so memory grows without bound. Use edge middleware or Upstash, or at least split the header and sweep expired entries.
44. ✱ **Add timeouts and stop leaking errors.** The backend `embedQuery` and all Gemini calls have no timeout. Error responses return raw upstream text (`err.message`, which includes Gemini's response body). Add `AbortSignal.timeout` and return generic messages to clients.
45. **Stop running a Chroma heartbeat on every request.** `getCollection()` makes a network round trip each time. Cache the collection handle and only heartbeat after a failure.
46. **Merge the duplicate RAG code.** `backend/lib/{rag,llm,chroma}.ts` and `apps/trader-chat/lib/*` have already drifted: different top-k defaults, one has `$in` and the other doesn't, one has a timeout and the other doesn't. Move them into one shared lib.

## F. Evaluation and testing

47. **Build a retrieval eval set.** The 200 T1/T2 questions are a ready-made gold set: each question should retrieve its own answer chunk. Track recall@5 and MRR in CI. That turns #1, #4, #5 and #7 into measurable changes instead of guesses.
48. **Evaluate answer faithfulness** with an LLM judge on a sample: is every claim supported by a cited chunk?
49. **Unit-test the pure functions** (`buildPrompt`, threshold filtering, `replaceRunId`, the chunk builder) and add a contract test for `proxyAgentJson`'s fallback behavior.
50. **Log each chat request with a request ID** covering embed, retrieve and LLM latency, token counts, tool calls and the empty-context rate, and show it on the existing `/api/health` page.

---

_Note: #20, #43 and #44 change how Gemini responses and rate limiting are handled, so they should go through `/fixy` rather than being patched ad hoc._

---

## Status — 2026-09-25 (after first implementation pass)

Uncommitted on `feat/swing-growth-frontend-pages`. Gemini was also replaced by OpenRouter (`lib/openrouter.ts` in both apps, same free-model fallback chain as nuwrrrld-portal).

### Done

| # | What landed |
|---|---|
| 1 | Lowercase `query: ` / `passage: ` prefixes (code only — needs re-ingest, below) |
| 2 | `ingest.py` prunes chunk IDs that no longer exist |
| 3 | Chunk IDs keyed by relative path (`source_file` metadata stays the bare filename so retrieval filters still match) |
| 13 | Chunks labelled `[S1]…` in the prompt (inline citation *rendering* is still #23) |
| 14 | Retrieved text wrapped in `<context>` tags, model told to ignore instructions inside |
| 17 | Stub tools removed |
| 18 | Comparison questions retrieve from both T1 and T2 files |
| 19 | Persona moved to a system message; temperature and max tokens set explicitly |
| 20 | Empty replies fail over to the next model; length cutoff is noted in the answer |
| 21 | Provider fallback — satisfied by the OpenRouter model chain |
| 33 | `requestJson` now returns `isFixture` (**banner not built yet**) |
| 34 | Proxy falls back to fixtures only on 5xx / network errors |
| 41 | `/embed` is a plain `def` (runs in the threadpool) |
| 42 | Moot — Gemini and its `?key=` URL are gone; OpenRouter key is in a header |
| 44 | Timeouts on backend embed call and every model attempt; chat routes return generic errors |

### Left to do

Follow-ups from this pass first, then the untouched items from the list.

**From this pass**

- [ ] **Re-ingest** so the index matches the new query prefix. Until then retrieval is mismatched.
  ```bash
  cd ~/code/ai-text-opt-1024 && python ingest.py
  ```
  Expect: every chunk re-embedded (the content hash now includes `EMBED_FORMAT_TAG`), stale IDs pruned.
- [ ] **Set the OpenRouter key** in the root `.env` (never printed here).
  ```bash
  cd ~/code/ai-text-opt-1024 && grep -c '^OPENROUTER_API_KEY=.' .env
  ```
  Expect `1`. If `0`, add the line, then check `GET /api/health` reports `llm: ok`.
- [ ] **#33 — build the "DEMO DATA" banner** in `SwingPage.tsx` / `GrowthPage.tsx` from `result.isFixture`.
- [ ] **#43 — rate limiter** (split `x-forwarded-for` in the backend, prune the `Map` in both apps). Sensitive surface: run it through `/fixy`, not an ad-hoc patch.
- [ ] **Pre-existing type errors** in `apps/trader-chat`: `lib/chroma.ts:61` (embedding function `undefined`) and `lib/rag.ts:66` (`raw.distances` possibly null).
- [ ] **Unverified:** `validate_and_swap` deletes the target collection and treats the *staging* collection as live, while the apps read `CHROMA_COLLECTION`. Confirm which collection name the apps actually query after an ingest.
- [ ] Clean up stale wording in `PIPELINE.md` sections that still describe Gemini/Mistral and tool-use.

**Untouched items from the list**

- **A. Retrieval:** #4 reranker, #5 hybrid search, #6 relative score cutoff, #7 chunk Q&A by question, #8 headings as metadata, #9 query rewrite, #10 MMR/dedup, #11 query-embedding cache, #12 recency
- **B. Generation:** #15 multi-turn memory, #16 streaming, #22 "not grounded" badge on the empty-context path
- **C. Chat UX:** #23–#32 (inline citations, persistence, stop/regenerate, feedback, T1/T2 compare view, confidence meter, follow-ups, markdown, shared chat package, accessibility)
- **D. Runs/proxy:** #35 run-status polling, #36 run diffs, #37 watchlists/alerts, #38 export, #39 deep links, #40 zod payload validation
- **E. Reliability:** #45 cache the Chroma handle, #46 merge duplicated RAG code (`openrouter.ts` is now duplicated on purpose; fold it into the shared lib)
- **F. Eval/testing:** #47 retrieval eval set (do this before #4–#8 so the changes are measurable), #48 faithfulness judge, #49 unit and contract tests (start with `openrouter.ts` fallback behaviour), #50 request logging with IDs
