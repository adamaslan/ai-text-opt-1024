# Swing + Growth Backend: Phased Implementation Guide

Generated: 2026-05-05

Companion docs:

- [swing-and-growth-pipeline-optimized.md](./swing-and-growth-pipeline-optimized.md) — Architecture, data contracts, scoring rules
- [swing-and-growth-frontend-pages-implementation.md](./swing-and-growth-frontend-pages-implementation.md) — Frontend phased build

Target repo:

- `/Users/adamaslan/code/gcp3/backend`

## What This Doc Covers

The backend half of the two-system pipeline. Implements:

- **System 1 — Swing (0–2 months):** A1 Discovery + A2 Critique. Tax weight: 0%.
- **System 2 — Growth (2 months – 10+ years):** B1 Quality & Durability + B2 Risk-Aware Tax. Tax weight: 10%.

Plus shared infrastructure: `ToolResult` contract, provider router, April 500 adapter, financial-statement adapter, ChromaDB ingest, Firestore persistence, FastAPI endpoints, and research-only enforcement layers.

This is the GCP3 side. The frontend repo (`ai-text-opt-1024`) consumes the endpoints defined here. The two repos must not duplicate finance logic — GCP3 is authoritative.

## Existing Backend Context

GCP3 already has substantial infrastructure to reuse, not rebuild:

- [agents/](../../gcp3/backend/agents/) — `base.py` (AgentLoop pattern), existing `macro_agent.py` and `market_overview_agent.py` to mirror
- [llm/](../../gcp3/backend/llm/) — `structured_call.py`, `grounded_call.py`, `cost_logger.py`, `pricing.py` already exist
- [schemas/](../../gcp3/backend/schemas/) — Pydantic schemas with `signal_output.py` as a precedent
- `feature_store.py`, `features_*.py` — 12+ feature modules already wired
- `data_client.py` — yfinance throttling, semaphore, caching pattern
- `firestore.py` — Firestore persistence helpers
- `screener.py`, `swing_predictions.py` (referenced in pipeline doc) — broad universe sources
- `gemini_client.py` — existing Gemini integration

Build on top of these, do not replace.

## Architecture Overview

```text
FastAPI (main.py)
  ├─ /agents/swing/run                 → swing_orchestrator.py
  ├─ /agents/swing/{run_id}            → firestore.py reads
  ├─ /agents/swing/{run_id}/chat       → rag/chat_service.py
  ├─ /agents/growth/run                → growth_orchestrator.py
  ├─ /agents/growth/{run_id}           → firestore.py reads
  └─ /agents/growth/{run_id}/chat      → rag/chat_service.py

agents/
  ├─ swing_discovery_agent.py    (A1)
  ├─ swing_critic_agent.py       (A2)
  ├─ swing_orchestrator.py
  ├─ growth_quality_agent.py     (B1)
  ├─ growth_tax_risk_agent.py    (B2)
  └─ growth_orchestrator.py

adapters/
  ├─ april500.py                 (Swing deep scan)
  └─ fundamentals.py             (Growth deep scan: FMP + Alpha Vantage)

llm/
  ├─ provider_router.py          (OpenRouter/Qwen3 → Mistral → Gemini)
  └─ [existing files]

scoring/
  ├─ swing_scoring.py            (0.50*A1 + 0.50*A2 - penalties)
  └─ growth_scoring.py           (0.90*B1 + 0.10*B2 - penalties; B1 calibration brackets)

rag/
  ├─ chroma_client.py
  ├─ ingest_pipeline.py
  └─ chat_service.py

schemas/
  ├─ tool_result.py
  ├─ swing.py
  ├─ growth.py
  └─ rag.py

config/
  ├─ swing_config.yaml
  └─ growth_config.yaml
```

Each phase produces a working end-to-end slice. Phase 1 produces a Swing run that returns deterministic decisions without LLMs. Phase 4 produces a Growth run with the same property. RAG and chat come last because they only matter once runs produce real evidence.

---

## Phase 0: Schemas, Config, and Compliance Spine

**Goal:** Lock in the Pydantic types, YAML configs, and research-only enforcement layers before any agent code is written. These are the contracts everything else depends on.

**Why first:** The pipeline doc specifies exact JSON shapes. Encoding them as Pydantic schemas with validators turns the doc into runtime invariants. Without this, downstream code drifts.

**Deliverables:**

1. `schemas/tool_result.py` — Generic `ToolResult` Pydantic model
   - Fields per pipeline doc: `tool_name`, `tool_family`, `inputs_hash`, `timeframe`, `status`, `score_delta`, `evidence`, `counter_evidence`, `risk_flags`, `source_timestamps`, `computed_at`
   - `tool_family` is a `Literal[...]` enum
   - `status` is `Literal["ok", "partial", "failed", "stale", "skipped"]`

2. `schemas/swing.py`:
   - `SwingEvidencePacket`, `SwingCritiquePacket`, `FinalSwingDecision`, `SwingRun`, `SwingIteration`, `SwingCandidateState`
   - `Direction = Literal["long", "short", "neutral", "avoid"]`
   - `Horizon = Literal["intraday", "2d-5d", "1w-3w", "1m-2m"]`
   - `Verdict = Literal["pass", "watch", "mutate", "reject", "needs_review"]`
   - `Decision = Literal["accept", "watchlist", "reject", "needs_review"]`
   - `compliance_label` field with validator that rejects anything other than `"research_only"`

3. `schemas/growth.py`:
   - `GrowthEvidencePacket`, `GrowthTaxRiskPacket`, `FinalGrowthDecision`, `GrowthRun`, `GrowthIteration`, `GrowthCandidateState`
   - `GrowthDirection = Literal["accumulate", "hold", "trim", "avoid"]`
   - `GrowthHorizon = Literal["2m-6m", "6m-2y", "2y-5y", "5y-10y", "10y-plus"]`
   - `KeyQuestionAnswer = Literal["tax_does_not_threaten_return", "tax_threatens_return", "tax_destroys_return"]`
   - `ScoreTrajectory` with `trend_direction`, `prior_scores`, `score_trend`
   - Same `compliance_label` validator

4. `schemas/april500.py`:
   - `April500ToolResult` extending `ToolResult`
   - All fields from the pipeline doc adapter contract: `net_score`, `signals.{bollinger,rsi,macd,ichimoku,volume_flow}`, `bar_confluence`, `support_resistance`, `multi_timeframe_outlook`, `files`, `files_persisted`

5. `schemas/fundamentals.py`:
   - `FundamentalsToolResult` extending `ToolResult`
   - `IncomeStatementSnapshot`, `BalanceSheetSnapshot`, `CashFlowSnapshot` — each with the metrics needed by B1 calibration brackets (revenue, net income, FCF, ROIC components, share count, debt, cash, EBITDA, interest expense)

6. `schemas/rag.py`:
   - `RagChatRequest`, `RagChatResponse`, `RagCitation`, `ChromaChunkMetadata`

7. `config/swing_config.yaml`:
   - `accept_threshold: 0.78`, `watchlist_threshold: 0.62`, `reject_threshold: 0.45`
   - `max_iterations_per_candidate: 5`
   - `april500_finalist_limit: 5`, `max_april500_timeframes_per_candidate: 3`
   - `min_average_dollar_volume: 20_000_000`, `max_spread_bps: 50`
   - Run mode TTLs (premarket/intraday/postmarket)
   - Penalty caps from pipeline doc

8. `config/growth_config.yaml`:
   - `accept_threshold: 0.75`, `watchlist_threshold: 0.60`, `reject_threshold: 0.45`
   - `max_iterations_per_candidate: 4`
   - `growth_candidate_limit: 20`, `growth_finalist_limit: 5`
   - `min_history_years: 5`, `min_average_dollar_volume: 50_000_000`
   - B1 weights (0.15, 0.15, 0.20, 0.15, 0.10, 0.10, 0.10, 0.05) — must sum to 1.00, validated at load
   - B2 weights (0.50, 0.25, 0.15, 0.10) — must sum to 1.00, validated at load
   - Calibration brackets per pipeline doc (revenue CAGR, FCF conversion, ROIC, etc.)
   - `financial_ttl_seconds: 604800` (7 days)
   - Run schedule: `weekly_run_cron: "0 18 * * 0"` (Sunday 18:00 UTC), quarterly + post-earnings triggers

9. `compliance/research_only.py`:
   - `enforce_research_only(decision)` — Pydantic validator helper
   - `EXECUTION_PHRASES` constant list (from pipeline doc RAG section)
   - `sanitize_response_text(text) -> tuple[str, bool]` — returns sanitized text + violation flag
   - FastAPI middleware that injects `X-Research-Only: true` header on every `/agents/*` response

10. `.github/workflows/research_only_check.yml` (or equivalent CI):
    - Greps the codebase for execution-flavored function names; fails build if found
    - Pattern list from pipeline doc: `place_order|submit_order|execute_trade|buy_market|sell_market|limit_order|stop_order|broker_submit`

**Acceptance:**
- `pytest schemas/tests/` passes; every schema has at least one valid + one invalid fixture
- `compliance_label` validator rejects any value other than `"research_only"` (proven by negative test)
- YAML configs load via Pydantic settings; weight-sum validators catch malformed configs
- CI grep check fails the build if a test commit adds `place_order` to any file
- `pytest` round-trips JSON examples from the pipeline doc through Pydantic without loss

**Out of scope this phase:** Any agent logic, any adapter, any orchestrator, any Firestore writes.

---

## Phase 1: Swing Discovery Agent (A1)

**Goal:** A1 produces deterministic `SwingEvidencePacket` objects from a list of candidate tickers using GCP3 feature modules. No April 500 yet, no LLM, no critique. End of phase: `python -m agents.swing_discovery_agent --tickers AAPL,MSFT,NVDA --mode manual` writes evidence packets to Firestore.

**Why second:** A1 is the funnel entrypoint. Building it without April 500 or LLM proves the deterministic spine works before adding expensive layers.

**Deliverables:**

1. `agents/swing_discovery_agent.py`
   - Inherits from `agents/base.py` `AgentLoop` pattern
   - Public method: `async def run(self, run_id, candidates, config) -> list[SwingEvidencePacket]`
   - Internally calls feature modules in this order: liquidity prefilter → trend → momentum → volume → volatility quality → multi-timeframe → sector-relative
   - Each feature returns a `ToolResult`; the agent aggregates feature scores into `SwingEvidencePacket.feature_scores`
   - Missing/stale features become `risk_flags`, not exceptions — the agent should produce a partial packet rather than crash

2. Candidate funnel (Stage 1 + Stage 2 from pipeline doc):
   - Stage 1 broad universe: integrate `screener.py`, `swing_predictions.py`, user watchlist, prior accepted/watchlist symbols
   - Hard prefilter: `min_average_dollar_volume`, `max_spread_bps`, missing price history, stale quote beyond run-mode TTL
   - Stage 2 lightweight feature pass: 12 GCP3 feature modules listed in pipeline doc; no April 500, no LLM

3. Feature aggregation:
   - `feature_scores` dict normalized to 0.0–1.0
   - Each feature contributes a `score_delta` and an evidence/counter-evidence string
   - Aggregated `swing_discovery_score` is the weighted average of feature scores per `swing_config.yaml`

4. GCP3 robustness fixes (from pipeline doc Section B):
   - Fix Firestore cache TTL to support both `ttl_seconds` and `ttl_hours`
   - Fix volume feature dispatch — normalize yfinance history to lowercase `volume`/`close`
   - Wire missing feature dispatches: correlation, regime, alignment, sector-relative, breadth, options sentiment, VIX-term
   - Fix Alpha Vantage `_av_call_count` initialization
   - Add yfinance throttling to `swing_predictions.py` paths
   - Make `/swing-predictions` honor `universe`, `top_n`, `period`, `force_refresh` query params
   - Add structured provider errors: `cache_cold`, `provider_limited`, `market_closed`, `partial_data`, `validation_failed`, `timeout`, `tool_failed`

5. `requires_counter_evidence: true` rule from pipeline doc — no candidate is promoted without at least one checked counter-evidence item or a `no_material_counter_evidence_found` marker

6. Firestore writes:
   - Collection `swing_evidence_packets`, key `run_id:ticker:iteration_number`
   - Collection `agent_tool_results`, key `run_id:iteration_id:tool_name:hash`
   - Use deterministic keys per pipeline doc

**Acceptance:**
- Running A1 against 50 tickers produces 50 `SwingEvidencePacket` Firestore documents
- Each packet has `swing_discovery_score` in `[0.0, 1.0]`
- Each packet either has counter-evidence or `no_material_counter_evidence_found`
- Stale tickers produce `is_stale: true` packets, not exceptions
- No yfinance rate-limit errors during a 100-ticker dry run
- `pytest agents/tests/test_swing_discovery.py` passes with mocked feature outputs

**Out of scope this phase:** April 500, A2 critique, LLM summary, orchestration loop.

---

## Phase 2: April 500 Adapter

**Goal:** Wrap `boll-4-april-500.py` as a normalized adapter that emits `April500ToolResult`. Run only on Swing finalists. End of phase: A1 can call the adapter for the top 5 candidates and store deep-scan results.

**Deliverables:**

1. Make `boll-4-april-500.py` import-safe at its source location:
   - Split CLI behavior into `main()`
   - Replace top-level side effects with function calls
   - Make output directory configurable (default `/tmp/april500/{run_id}/`)
   - The script lives at `/Users/adamaslan/code/ai-fin-opt2/alpha-fullstack/ai-fin3/boll-4-april-500.py` per pipeline doc; do not move it, just refactor in place

2. `adapters/april500.py`:
   - `class April500Adapter` with constructor accepting config
   - `async def scan(ticker, period, run_id) -> April500ToolResult`
   - Calls `SignalDetectorExporter` from the script via either typed function import or subprocess wrapper
   - Per-symbol/per-timeframe timeout from config (default 30s)
   - Failure on one symbol/timeframe writes a `failed` `ToolResult` and continues; does not break the loop

3. Output normalization:
   - Convert script output into all `April500ToolResult` fields per pipeline doc
   - `net_score` is the single normalized 0.0–1.0 number Swing uses; sub-signals are informational
   - `bar_confluence_ratio` = `bars_with_majority_signal_alignment / bars_checked`
   - `support_resistance.proximity_score` mapped from price-to-support/resistance percentages
   - `multi_timeframe_outlook.agreement` derived from short/medium/long agreement

4. Cache layer:
   - Cache key: `f"april500:{ticker}:{period}:{source_data_timestamp}"`
   - TTL from run mode config
   - Skip rerunning if a fresh result exists

5. Wire into A1:
   - A1 finalist selection: top 5 candidates by `swing_discovery_score` after Stage 2
   - For each finalist, call `April500Adapter.scan` for up to 3 timeframes (`1mo`, `3mo`, `6mo` default)
   - Add `april500` score into `SwingEvidencePacket.feature_scores`

6. File handling:
   - Reports/charts written to `/tmp/april500/{run_id}/` during runtime
   - `files_persisted: false` by default; mark `true` only if uploaded to Cloud Storage
   - Frontend receives file paths but does not require them to render

7. `agents/tests/test_april500_adapter.py`:
   - Fixture-based test using a saved April 500 output
   - Validates round-trip into `April500ToolResult`
   - Validates timeout handling (mock a slow call)
   - Validates partial-failure handling (one timeframe fails, others succeed)

**Acceptance:**
- `April500Adapter.scan("AAPL", "3mo", run_id)` produces a valid `April500ToolResult`
- Cap enforced: max 5 finalists × 3 timeframes = 15 calls per run, exactly
- A run with all April 500 calls failing still produces a final decision (with appropriate penalty)
- The script no longer has import-time side effects; `import boll_4_april_500` is safe

---

## Phase 3: Swing Critic Agent (A2) and Swing Orchestrator

**Goal:** A2 produces `SwingCritiquePacket` consuming A1's evidence. The orchestrator combines them via `0.50*A1 + 0.50*A2 - penalties`, applies stop rules, selects mutations, and writes `FinalSwingDecision`. End of phase: a full Swing run end-to-end without LLMs.

**Deliverables:**

1. `agents/swing_critic_agent.py`:
   - Public method: `async def run(self, evidence_packet) -> SwingCritiquePacket`
   - Rule-based critique only (no LLM in this phase)
   - Stop geometry: compute entry zone, invalidation level (recent swing low for longs / swing high for shorts), ATR distance, R/R estimate
   - Event risk: query market calendar / earnings radar (`earnings_radar.py` already exists in GCP3) for earnings within 48h; check FOMC/CPI calendar
   - Liquidity check: validate against `min_average_dollar_volume` and `max_spread_bps` again post-deep-scan
   - Correlation check: against already-accepted tickers in this run
   - Penalty arithmetic per pipeline doc penalty caps (`risk_penalty: 0.0–0.35`, `stale_data_penalty: 0.0–0.30`)
   - Produces `swing_critic_score` in `[0.0, 1.0]` and `verdict`

2. Hard blockers per pipeline doc:
   - No definable stop → `reject` regardless of score
   - Earnings within 48h → `reject` regardless of score
   - Stale data on required timeframes → `needs_review`
   - Liquidity below configured floor → `reject`

3. `scoring/swing_scoring.py`:
   - `compute_swing_total_score(evidence, critique, config) -> float`
   - Formula: `0.50 * a1 + 0.50 * a2 - risk_penalty - stale_data_penalty`
   - Penalty cap enforcement: total penalty <= `0.55`
   - Returns score + breakdown for UI audit (every score must be explainable)

4. `agents/swing_orchestrator.py`:
   - Owns `CandidateState` per ticker
   - Iteration loop per pipeline doc pseudocode (max 5 iterations)
   - Decision tree: `accept | watchlist | mutate_and_retry | reject | needs_review`
   - Stop rules: score >= accept_threshold, score < reject_threshold, improvement < epsilon for 2 iterations, repeated mutation, stale data, budget exhausted

5. Mutation selection:
   - Mutation menu from pipeline doc: `timeframe_expand`, `timeframe_contract`, `sector_relative_check`, `risk_filter_tighten`, `volatility_regime_adjust`, `deep_scan_extra_period`, `counter_evidence_expand`
   - `select_mutation(state, iteration_history) -> MutationPlan` — never repeats the same mutation, prefers cheap before expensive
   - Records mutation reason on each iteration document

6. Firestore writes:
   - `swing_runs` (run-level state)
   - `swing_candidates` (latest candidate state)
   - `swing_iterations` (per-iteration audit)
   - `swing_critique_packets`
   - `final_swing_decisions`
   - All keys deterministic per pipeline doc

7. `agents/tests/test_swing_orchestrator.py`:
   - Fixture: 3 candidates, mocked feature outputs
   - Validates: high-scoring candidate accepts on iteration 1; mid-scoring candidate mutates and either accepts or watchlists; low-scoring candidate rejects
   - Validates: hard blockers override numeric score
   - Validates: improvement-epsilon stop rule fires when score plateau detected

**Acceptance:**
- A full Swing run on 25 candidates completes in under 5 minutes (no LLM, finalists-only April 500)
- Every `FinalSwingDecision` has a `decision_reason` explaining why the loop stopped
- No iteration ever repeats the same mutation type
- `compliance_label` is `"research_only"` on every decision (Pydantic enforces this)

---

## Phase 4: Provider Router and LLM Layer

**Goal:** Provider-neutral LLM gateway with OpenRouter/Qwen3 → Mistral → Gemini fallback, schema validation, circuit breakers, and budget tracking. Wire into A1 and A2 as optional finalist-only summaries.

**Why now:** Both Swing agents work without LLMs. Adding LLMs later means the deterministic spine is the source of truth, and LLM calls are clearly opt-in.

**Deliverables:**

1. `llm/provider_router.py`:
   - `async def structured_llm_call(request, schema, budget, fallback_policy) -> ProviderResult`
   - Tries providers in order from config (default: `["openrouter_qwen3", "mistral", "gemini"]`)
   - Per-provider attempt record per pipeline doc shape
   - Schema validation via Pydantic; failed validation triggers fallback
   - Returns `ai_degraded: true` if all providers failed and rule-based fallback was used

2. Provider implementations:
   - `llm/providers/openrouter.py` — uses `OPENROUTER_API_KEY` and `OPENROUTER_QWEN3_MODEL` env vars
   - `llm/providers/mistral.py` — uses `MISTRAL_API_KEY` and `MISTRAL_MODEL`
   - `llm/providers/gemini.py` — wraps existing `gemini_client.py`
   - Each implements a common `Provider` protocol with `async def call(request, timeout) -> str`

3. Circuit breaker:
   - `llm/circuit_breaker.py`
   - Per-provider state: closed (healthy), open (failing), half-open (probe)
   - Open after 3 consecutive failures or schema-validation errors
   - Auto-close after a 5-minute cool-down window
   - Skipped attempts logged as `status: budget_skipped` or `status: circuit_open`

4. Budget tracking:
   - `llm/budget.py`
   - Per-run budget: `max_llm_calls_per_run: 5` (config default, low until proven useful)
   - Per-provider cost estimate via `pricing.py` (already exists)
   - Budget exhaustion → all subsequent calls skip to rule-based fallback

5. Persistence:
   - Collection `agent_llm_attempts`, key `run_id:iteration_id:agent:call_number:provider`
   - Stores: provider, model, latency, status, schema validity, cost estimate, fallback reason

6. Wire into A1 and A2:
   - A1: 1 LLM call per accepted finalist for setup explanation (optional)
   - A2: 1 LLM call per finalist for critique narrative (optional)
   - Both gated behind `include_llm: bool` request parameter and budget availability
   - LLM output goes into `llm_summary` field; deterministic summary still required

7. Rule-based fallback:
   - When all providers fail, generate a deterministic summary from the evidence packet
   - Mark `ai_degraded: true`
   - Include `llm_unavailable` note in final decision

8. `llm/tests/`:
   - `test_provider_router.py` — fallback order validated by mocking provider responses
   - `test_circuit_breaker.py` — open/half-open/closed transitions
   - `test_schema_validation.py` — malformed JSON triggers next provider

**Acceptance:**
- All three providers can be disabled and runs still complete (deterministic output, `ai_degraded: true`)
- A timeout on OpenRouter triggers Mistral within `timeout_seconds` (default 45)
- Schema validation failure on Mistral triggers Gemini
- Budget exhaustion mid-run does not break the run; subsequent calls skip to rule-based
- Provider attempt log shows the full fallback chain for any run

---

## Phase 5: Fundamentals Adapter (Growth Deep Scan)

**Goal:** Build the Growth equivalent of April 500. Fetches 5+ years of financial statements from FMP (primary) and Alpha Vantage (fallback), normalized into `FundamentalsToolResult`. End of phase: B1 can call the adapter on a finalist and get all metrics needed for the 8 sub-scores.

**Why before B1:** B1 cannot exist without its data source. Build the source first, mock it during B1 unit tests if needed.

**Deliverables:**

1. `adapters/fundamentals.py`:
   - `class FundamentalsAdapter`
   - `async def fetch(ticker, run_id) -> FundamentalsToolResult`
   - Pulls: annual income statement (5+ years), annual balance sheet (5+ years), annual cash flow (5+ years), quarterly revenue (last 8 quarters), insider transactions (last 90 days), institutional ownership, dividend history

2. Provider order per pipeline doc Growth Universe Spec:
   - Primary: FMP (Financial Modeling Prep) — uses `FMP_API_KEY` env var
   - Fallback: Alpha Vantage — uses `ALPHA_VANTAGE_API_KEY`
   - Per-source rate limit tracking (FMP free tier vs. paid tier handled in config)
   - On primary failure, retry on fallback automatically

3. Data normalization:
   - All financial-statement values converted to floats (USD millions or raw dollars consistently)
   - Lowercase field names
   - Missing values filled with `None`, not 0
   - Validation flags when key fields are missing (revenue, net income, FCF, total debt, cash, share count, EBITDA)

4. Insider activity:
   - `insider_cluster_selling_detected: bool` — true if 3+ distinct insiders filed Form 4 sales in any 30-day window in the last 90 days
   - Per pipeline doc B1 hard-rejection rule

5. Going-concern check:
   - Parse SEC EDGAR filing text or use FMP's audit-opinion flag
   - `going_concern_doubt: bool` — true if flagged in last 2 fiscal years
   - Per pipeline doc B1 hard-rejection rule

6. Cache layer:
   - TTL: `financial_ttl_seconds: 604800` (7 days) per pipeline doc
   - Cache key: `f"fundamentals:{ticker}:{statement_type}:{fiscal_year}"`
   - Force-refresh option for post-earnings runs

7. Pre-filters from pipeline doc Growth Universe Spec:
   - Min 5 years of financial history
   - No going-concern audit opinion in last 2 years
   - Revenue not declining 2+ consecutive years (returned as flag, agent decides on hard-reject)
   - Not a SPAC or shell company (FMP company-type field)

8. `adapters/tests/test_fundamentals.py`:
   - Fixture-based with saved FMP and Alpha Vantage responses
   - Validates: round-trip to `FundamentalsToolResult`, fallback when FMP fails, ROIC calculation precision, insider cluster detection logic

**Acceptance:**
- `FundamentalsAdapter.fetch("MSFT", run_id)` returns a complete `FundamentalsToolResult`
- 5-year history correctly populated; missing years flagged, not silently zero-filled
- ROIC calculation matches a hand-computed reference within 1%
- Insider cluster detection correctly fires on a 3-insider/30-day fixture
- Run with 20 tickers stays under FMP rate limits

---

## Phase 6: Growth Quality Agent (B1)

**Goal:** B1 consumes `FundamentalsToolResult` and produces `GrowthEvidencePacket` with all 8 sub-scores per pipeline doc calibration brackets. End of phase: deterministic Growth quality scoring across a candidate set.

**Deliverables:**

1. `agents/growth_quality_agent.py`:
   - Public method: `async def run(self, run_id, candidates, config) -> list[GrowthEvidencePacket]`
   - For each finalist, call `FundamentalsAdapter`
   - Apply all 8 sub-score calibration brackets per pipeline doc
   - Produce composite `growth_quality_score` per the documented weighted formula

2. `scoring/growth_scoring.py` — sub-score functions, one per metric:
   - `score_revenue_growth(revenue_history) -> float` — 3-year CAGR brackets + deceleration penalty
   - `score_earnings_quality(net_income_history, fcf_history, total_assets) -> float` — FCF conversion brackets + accruals penalty
   - `score_roic_trend(ebit_history, tax_rate, equity, debt, cash) -> float` — ROIC absolute brackets + 3-year trend modifier
   - `score_moat_durability(gross_margin, revenue_cagr, quarterly_revenue, rd_pct, customer_concentration) -> float` — rule-based proxy + LLM adjustment hook
   - `score_capital_allocation(share_count_history, capex_pct, dividend_payout) -> float`
   - `score_management_alignment(insider_transactions, ceo_ownership, sbc_pct) -> float`
   - `score_valuation_discipline(price, fcf, growth_rate) -> float` — FCF yield brackets + pre-profit-growth exception
   - `score_balance_sheet(cash, total_debt, ebitda, interest_coverage) -> float` — net cash bonus + leverage warning flag

3. Composite formula:
   - `growth_quality_score = 0.15*revenue + 0.15*earnings + 0.20*roic + 0.15*moat + 0.10*capital + 0.10*mgmt + 0.10*valuation + 0.05*balance_sheet`
   - Weight sum validated at config load
   - Hard-rejection flags per pipeline doc override numeric score:
     - Revenue declining 2+ years → reject
     - No path to positive FCF → reject
     - Going-concern doubt → reject
     - Insider cluster selling → reject

4. Direction inference:
   - `accumulate` if score >= accept_threshold and momentum positive
   - `hold` if score in watchlist range
   - `trim` if score declining trend over last 4 runs (uses Phase 8 trajectory data; Phase 6 produces `insufficient_history` until then)
   - `avoid` if score < reject_threshold or hard-reject flag set

5. Optional LLM moat critique:
   - When rule-based moat score is in `[0.40, 0.70]` (ambiguous range), allow ±0.15 LLM adjustment
   - Uses provider router from Phase 4
   - Adjustment must include reasoning string in `supporting_evidence` or `counter_evidence`

6. `agents/tests/test_growth_quality.py`:
   - Per-sub-score unit tests with known fixtures (e.g., 25% CAGR → score 1.00, negative CAGR → score 0.05)
   - Composite test: hand-computed score matches function output
   - Hard-rejection override test: low-quality flag wins over high numeric score
   - Pre-profit-growth exception test: negative FCF + 30% revenue CAGR + 65% gross margin → 0.55 valuation score, `valuation_exception: pre_profit_growth`

**Acceptance:**
- All 8 sub-scores produce values in `[0.0, 1.0]`
- Composite weighted formula sums correctly across 100 fixture tickers
- Hard-rejection flags always override numeric score
- Score audit: every output explainable as raw metric → bracket → final score
- Running B1 against a 5-ticker fixture set completes in under 30s with cached fundamentals

---

## Phase 7: Growth Tax Risk Agent (B2) and Growth Orchestrator

**Goal:** B2 consumes `GrowthEvidencePacket` and produces `GrowthTaxRiskPacket` with the 4 sub-scores. Growth Orchestrator combines via `0.90*B1 + 0.10*B2 - penalties`. End of phase: full Growth run end-to-end.

**Deliverables:**

1. `agents/growth_tax_risk_agent.py`:
   - Public method: `async def run(self, evidence_packet, tax_profile, account_bucket) -> GrowthTaxRiskPacket`
   - 4 sub-scores per pipeline doc B2:
     - `after_tax_downside_score` (0.50 internal weight)
     - `asset_location_fit_score` (0.25)
     - `dividend_tax_efficiency_score` (0.15)
     - `exit_flexibility_score` (0.10)
   - Returns `key_question_answer`: `tax_does_not_threaten_return | tax_threatens_return | tax_destroys_return`

2. After-tax downside math:
   - Worst-case scenario: forced sale at short-term capital gains rate
   - Compare expected after-tax return to inflation rate (configurable, default 3%)
   - If after-tax expected return > inflation by margin → `tax_does_not_threaten_return`
   - If approximately equal → `tax_threatens_return`
   - If below inflation → `tax_destroys_return`

3. Asset location fit:
   - Score by account bucket: same business in Roth/HSA scores higher than taxable
   - Dividend-heavy stocks score higher in retirement accounts
   - High-turnover Growth ideas score higher in tax-advantaged buckets
   - Per pipeline doc: never pretend assets can magically shift; score the comparison

4. Dividend tax efficiency:
   - Qualified dividend percentage (FMP / SEC data)
   - Dividend payout ratio
   - International ADRs flagged (foreign withholding tax)

5. Exit flexibility:
   - Lot structure if available (taxable account only)
   - Holding-period clock (days to long-term threshold)
   - Wash-sale exposure if recent realized loss exists

6. Hard blockers (escalate to `needs_review`, do not auto-reject):
   - Taxable account with missing tax profile
   - Wash-sale status `blocked`
   - Tax complexity requiring CPA review (PFIC, K-1, complex options)
   - `professional_review_required: true` in these cases

7. `agents/growth_orchestrator.py`:
   - Same iteration pattern as Swing Orchestrator
   - Mutations from pipeline doc Growth menu:
     - `valuation_stress_test`
     - `competitive_deep_dive`
     - `management_review`
     - `balance_sheet_stress`
     - `asset_location_compare`
     - `dividend_efficiency_check`
   - Max 4 iterations per candidate
   - Stop rules: same shape as Swing, different thresholds (`accept: 0.75`, `reject: 0.45`)

8. Composite formula:
   - `growth_total_score = 0.90 * B1 + 0.10 * B2 - quality_risk_penalty - tax_complexity_penalty`
   - Penalty caps: `quality_risk_penalty: 0.0–0.35`, `tax_complexity_penalty: 0.0–0.20`
   - Total penalty cap: `0.45`

9. Firestore writes:
   - `growth_runs`, `growth_candidates`, `growth_iterations`, `growth_evidence_packets`, `growth_tax_risk_packets`, `final_growth_decisions`
   - Same deterministic key shape as Swing

10. `agents/tests/test_growth_orchestrator.py`:
    - Fixture: high-quality compounder, mediocre business, fraud signal
    - Validates: tax does not kill a 90% B1 candidate
    - Validates: hard-reject flag from B1 overrides everything
    - Validates: `professional_review_required` propagates from B2 to final decision

**Acceptance:**
- A full Growth run on 20 candidates completes in under 10 minutes
- A great business (B1=0.90) with poor tax fit (B2=0.30) still accepts (composite = 0.84)
- A mediocre business (B1=0.50) with great tax fit (B2=0.95) does not accept (composite = 0.545)
- The 90/10 weighting is observable in score audit output
- Score trajectory placeholder fields populated as `insufficient_history` (real values in Phase 8)

---

## Phase 8: Score Trajectory and Cross-Run State

**Goal:** Track Growth ticker scores across weekly runs. Surface `score_trend: deteriorating` warnings. Feed into the orchestrator so a deteriorating trend can downgrade a numeric `accept` to `watchlist`.

**Why a separate phase:** Trajectory only matters once 4+ runs exist. Building it earlier means writing code with no data to validate against.

**Deliverables:**

1. `scoring/growth_trajectory.py`:
   - `compute_score_trajectory(ticker, current_score) -> ScoreTrajectory`
   - Reads last 4 `final_growth_decisions` for the ticker
   - Returns: `trend_direction`, `prior_scores`, `score_trend`, `trend_window_runs`

2. Trend logic:
   - `improving`: most recent 3 scores monotonically increasing
   - `stable`: scores within 0.05 of each other
   - `deteriorating`: most recent 3 scores monotonically decreasing
   - `insufficient_history`: fewer than 4 prior runs

3. Orchestrator integration:
   - After computing `growth_total_score`, fetch trajectory
   - If `score_trend: deteriorating` and current decision would be `accept`, downgrade to `watchlist` with reason `score_trend_deteriorating`
   - If `score_trend: deteriorating` for 3+ consecutive runs, escalate to `needs_review`
   - Trajectory record included in `FinalGrowthDecision`

4. Run scheduling per pipeline doc:
   - `scheduled_runs/weekly_growth.py` — cron entry for Sunday 18:00 UTC
   - `scheduled_runs/post_earnings_growth.py` — triggered by earnings calendar within 24h of any accepted/watchlist ticker's release
   - `scheduled_runs/quarterly_growth.py` — first Sunday of each calendar quarter, full re-scan
   - All use Cloud Scheduler or equivalent; do not hardcode the cron

5. `agents/tests/test_growth_trajectory.py`:
   - Fixture: 5 prior runs with scores `[0.85, 0.84, 0.82, 0.79, 0.76]`
   - Expected: `score_trend: deteriorating`, current accept downgrades to watchlist
   - Edge case: insufficient history returns `insufficient_history`, no downgrade

**Acceptance:**
- A ticker with 4 prior weekly scores trending down is downgraded
- A ticker with 4 prior weekly scores trending up gets a `trend_direction: improving` annotation but no decision change
- Tickers with no history are not penalized
- Frontend trajectory chart matches backend trajectory record

---

## Phase 9: ChromaDB Ingest Pipeline and RAG Chat Service

**Goal:** Index every persisted packet/decision into ChromaDB after each run completes. Wire a chat endpoint that answers questions grounded in retrieved evidence.

**Why last:** RAG only makes sense once runs produce evidence worth indexing. Building it earlier means indexing nothing.

**Deliverables:**

1. `rag/chroma_client.py`:
   - `ChromaPersistentClient` initialized from `CHROMA_PERSIST_DIR` env var
   - 8 collections per pipeline doc: `swing_evidence`, `swing_critique`, `swing_decisions`, `growth_evidence`, `growth_tax_risk`, `growth_decisions`, `trader_notes`, `rejected_ideas`
   - Each collection: `metadata={"hnsw:space": "cosine"}`
   - Persistence directory must be a mounted volume on Cloud Run, NOT `/tmp`

2. `rag/ingest_pipeline.py`:
   - `async def ingest_run_to_chroma(run_id, system) -> IngestReport`
   - Pulls all completed packets for a run from Firestore
   - Chunks per pipeline doc strategy: one chunk per packet, separate sub-chunks for long LLM narrative fields
   - Embeds via configured embedding model (default `text-embedding-3-small`)
   - Upserts to ChromaDB with full metadata envelope
   - Idempotent: re-ingesting the same run_id updates existing chunks rather than duplicating

3. Chunk metadata envelope per pipeline doc:
   - `system`, `collection`, `ticker`, `run_id`, `iteration`, `decision`, `score`, `direction`, `computed_at`, `is_stale`, `ai_degraded`, `compliance_label`, `source_doc_id`

4. Embedding model handling:
   - Model name stored in each chunk's metadata
   - Validation on read: never mix embedding models within a collection
   - If model changes, full re-ingest required (manual trigger)

5. Trigger ingestion:
   - Hook into orchestrator: after run completes, enqueue ingest job
   - Ingest runs async, never blocks run completion
   - Failure logging without retry storm

6. `rag/chat_service.py`:
   - `POST /agents/swing/{run_id}/chat` and `POST /agents/growth/{run_id}/chat`
   - Request shape from pipeline doc: `message`, `session_id`, `context.{system_filter, ticker_filter, run_id_filter, decision_filter, max_chunks, include_stale, include_rejected}`
   - Response shape from pipeline doc: `answer`, `citations`, `answer_grounded`, `compliance_label`, `provider_used`, `ai_degraded`

7. Retrieval logic:
   - Query ChromaDB with `run_id_filter` (default) or unscoped (cross-run mode)
   - Cross-run mode requires a date-range guard (default 90 days) to bound query cost
   - Top `max_chunks` (default 8) chunks returned
   - Filter by metadata before embedding similarity (stale, rejected flags)

8. LLM grounding:
   - System prompt from pipeline doc — bans invented prices/scores, requires chunk_id citations, emits `research_only` label
   - Uses provider router from Phase 4
   - `answer_grounded: false` flag if LLM answers from training data rather than retrieved chunks

9. Compliance post-filter:
   - `EXECUTION_PHRASES` constant from `compliance/research_only.py`
   - `sanitize_response_text(text) -> tuple[str, bool]`
   - Violation → return sanitized response with `compliance_violation_detected: true`
   - Violation logged with the original text and citations for audit

10. `rag/tests/`:
    - `test_ingest_pipeline.py` — round-trip Firestore → ChromaDB
    - `test_chat_service.py` — grounded answers, citation correctness, ungrounded warnings
    - `test_compliance_filter.py` — execution phrases trigger sanitization

**Acceptance:**
- A completed run is fully indexed into ChromaDB within 60s of completion
- Chat queries against an indexed run cite real chunk_ids
- Asking a question outside the run's scope returns "I don't have enough evidence in the current run to answer this"
- Cross-run queries respect the 90-day default date range
- Execution-phrase responses are sanitized before reaching the response payload
- Re-ingesting the same run does not duplicate chunks

---

## Phase 10: Endpoints, Middleware, and Operational Polish

**Goal:** Expose the FastAPI endpoints the frontend consumes, add observability, and pass operational readiness checks.

**Deliverables:**

1. `main.py` route registrations:
   ```text
   POST /agents/swing/run
   GET  /agents/swing/latest
   GET  /agents/swing/{run_id}
   POST /agents/swing/{run_id}/chat

   POST /agents/growth/run
   GET  /agents/growth/latest
   GET  /agents/growth/{run_id}
   POST /agents/growth/{run_id}/chat
   ```

2. Request/response models:
   - `SwingRunRequest`, `SwingRunResponse`, `SwingLatestResponse`, `SwingRunDetailResponse`
   - Same for Growth
   - Pydantic validation on input; 422 on malformed requests

3. Long-running run handling:
   - Both `/run` endpoints return immediately with `run_id` and `status: queued`
   - Actual orchestration runs in a background task (FastAPI `BackgroundTasks` or a queue)
   - Cloud Run timeout-safe: never block the HTTP response on the full run

4. Middleware:
   - `X-Research-Only: true` injected on every `/agents/*` response
   - Request ID generation and propagation to logs
   - Structured error responses with `cache_cold | provider_limited | market_closed | partial_data | validation_failed | timeout | tool_failed`

5. Observability:
   - Per-run metrics: duration, candidates seen, finalists, accepted/watchlist/rejected counts, LLM calls used, April 500 calls used, total cost estimate
   - Logged in structured JSON for Cloud Logging
   - Frontend run summary card reads these directly

6. Health checks:
   - `GET /health` returns provider availability, Firestore reachability, ChromaDB reachability
   - Used by Cloud Run probes and frontend status banner

7. Cloud Run hardening:
   - Memory cap configured (default 2 GB; bump if April 500 jobs OOM)
   - Concurrency cap to bound simultaneous April 500 / fundamentals fetches
   - `/tmp` cleanup on run completion (April 500 reports, fundamentals raw responses)
   - ChromaDB volume mount configured separately

8. `tests/integration/`:
   - `test_swing_endpoint_dry_run.py` — POST with `dry_run: true` returns valid run_id and completes within 5 minutes
   - `test_growth_endpoint_dry_run.py` — same
   - `test_chat_endpoint.py` — completed run is queryable via chat
   - `test_compliance_header.py` — every `/agents/*` response has `X-Research-Only`

**Acceptance:**
- All 8 endpoints return correct shapes against committed fixtures
- Full Swing dry-run from `POST /agents/swing/run` to `GET /agents/swing/{run_id}` works end-to-end
- Full Growth dry-run works end-to-end
- Chat endpoint answers questions about a real completed run
- `X-Research-Only` header present on every response
- CI grep check passes
- `pytest tests/` passes with > 80% coverage on agents and adapters

---

## Phase Dependencies

```text
Phase 0 (schemas + config + compliance) ─┬─→ Phase 1 (A1 Discovery) ─┐
                                          │                            │
                                          │                            ▼
                                          │           Phase 2 (April 500 adapter)
                                          │                            │
                                          │                            ▼
                                          │           Phase 3 (A2 Critic + Swing Orchestrator)
                                          │                            │
                                          │                            ▼
                                          │           Phase 4 (Provider router + LLM)
                                          │                            │
                                          ├─→ Phase 5 (Fundamentals adapter)
                                          │                            │
                                          │                            ▼
                                          │           Phase 6 (B1 Quality)
                                          │                            │
                                          │                            ▼
                                          │           Phase 7 (B2 Tax Risk + Growth Orchestrator)
                                          │                            │
                                          │                            ▼
                                          │           Phase 8 (Score trajectory)
                                          │                            │
                                          │                            ▼
                                          │           Phase 9 (ChromaDB + RAG chat)
                                          │                            │
                                          └────────────────────────────┴─→ Phase 10 (Endpoints + ops)
```

Phases 1–4 (Swing) and Phases 5–8 (Growth) can run in parallel after Phase 0 if two developers are available. Phase 4 (provider router) is shared and benefits both systems. Phase 9 requires both systems producing evidence. Phase 10 is the final integration layer.

---

## Validation at Each Phase

Every phase should answer:

1. Does `pytest` pass?
2. Does `mypy` (or equivalent type checker) pass?
3. Does the CI grep check for execution language pass?
4. Are Pydantic schemas the source of truth — no untyped dicts crossing module boundaries?
5. Does a dry run produce expected outputs against committed fixtures?

These five checks are the per-phase gate. Don't move to the next phase until they pass.

---

## Cross-Cutting Invariants (Enforced Across All Phases)

These rules apply at every phase. Violating any of them is a refactor trigger, not a TODO.

- **No agent fetches market data directly.** Agents call adapters; adapters wrap `data_client.py`.
- **No scoring logic shared between Swing and Growth.** Even if the formulas look similar, keep them separate.
- **No execution language anywhere.** CI grep enforces this.
- **No untyped JSON crossing module boundaries.** Pydantic schemas only.
- **No silent fallbacks.** If a provider fails or data is stale, surface it with an explicit flag.
- **No magic numbers in code.** Thresholds, weights, caps, TTLs all live in YAML config.
- **No hardcoded model IDs.** Model names come from `provider_env` config.
- **No direct ChromaDB calls from agents.** Agents write to Firestore; the ingest pipeline reads Firestore and writes ChromaDB.
- **No `/tmp` for ChromaDB.** Mounted volume only.
- **No `dry_run: false` defaults.** Manual triggers default to dry-run.

---

## Out of Scope (Across All Phases)

- Order placement, broker integration, trade execution endpoints
- Real-time streaming endpoints — polling is sufficient
- Multi-tenant isolation — assume single-trader/single-org deployment
- Fine-tuning custom models — use commercial APIs only
- Custom embedding models — use the configured commercial embedding API
- Backtesting framework — reference paper-trading or historical replay separately
- Alternative data (sentiment from social media, etc.) — out of initial scope

---

## Open Questions

These should be resolved before Phase 0 starts but are not blockers if deferred:

1. **FMP vs. Alpha Vantage primary:** The pipeline doc names FMP primary and Alpha Vantage fallback. Is the team paying for FMP, or should we flip the order? This affects rate limit budgets in Phase 5.
2. **ChromaDB hosting:** Local persistent volume on Cloud Run, or hosted ChromaDB Cloud? Affects Phase 9 deployment.
3. **Cloud Scheduler vs. Cloud Tasks vs. internal cron:** What's the existing pattern in GCP3 for scheduled jobs? Affects Phase 8.
4. **Background task framework:** FastAPI `BackgroundTasks` is in-process. For Cloud Run, a queue (Pub/Sub, Cloud Tasks) may be needed for long-running orchestrations. Affects Phase 10.
5. **Embedding model:** OpenAI `text-embedding-3-small` is the default. If the team uses a different embedding provider, decide before Phase 9.
6. **Existing `agents/base.py` AgentLoop:** Does the existing pattern fit the four new agents, or does it need extension? Affects Phase 1.

Resolve these in conversation with the user, not by guessing during implementation.
