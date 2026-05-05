# Swing + Growth Pipeline: Optimized Two-System Implementation Guide

Generated: 2026-05-05

Source guides:

- `/Users/adamaslan/code/ai-text-opt-1024/docs/recursive-swing-tax-confluence-agent-loop-50-step-guide.md`
- `/Users/adamaslan/code/ai-text-opt-1024/docs/two-agent-finance-pipeline-50-step-guide.md`
- `/Users/adamaslan/code/ai-text-opt-1024/docs/swing-vs-tax-optimized-trading-50-step-guide.md`

Primary systems to reuse:

- `/Users/adamaslan/code/gcp3/backend`
- `/Users/adamaslan/code/ai-fin-opt2/alpha-fullstack/ai-fin3/boll-4-april-500.py`
- `/Users/adamaslan/code/ai-text-opt-1024`
- `/Users/adamaslan/code/ai-text-opt`

## Why This Doc Exists

The previous 60-step guide built one recursive loop with four agents that mixed swing trading and tax-aware long-horizon research into the same scoring formula. That conflation is the wrong shape for the actual goals:

- A short swing (0–2 months) does not benefit from tax weighting; tax should be 0% of the decision.
- A long-horizon hold (2 months – 10+ years) is mostly a "is the business good?" question; tax matters only as downside protection, never as the primary driver.

This doc replaces the four-agent confluence loop with **two independent two-agent systems**:

- **System 1 — Swing (0–2 months):** A1 Discovery + A2 Critique. Tax weight: 0%.
- **System 2 — Growth (2 months – 10+ years):** B1 Quality & Durability + B2 Risk-Aware Tax. Tax weight: 10%.

Each system has its own orchestrator, scoring formula, endpoints, and frontend tab. They share infrastructure (cache, feature modules, provider router, `ToolResult` contract, Firestore plumbing) but never share scoring logic.

Important boundary:
This is financial research tooling, not investment, tax, legal, accounting, or trade-execution advice. Keep human approval between research output and any brokerage action. Keep all tax assumptions configurable and CPA-reviewable.

---

## System 1: Swing (0–2 Months)

**Tax weight: 0%. Pure technical merit.**

### Agent A1 — Swing Discovery

Role:
Find candidates using technical evidence. Owns broad ranking, technical scoring, and April 500 deep-scan invocation for finalists.

Primary outputs:

- `SwingEvidencePacket`
- `SwingDiscoveryScore`

Process:

1. Filter universe by liquidity, volume, spread, and price-history sufficiency.
2. Score lightweight technical features: trend, momentum, volume, volatility quality, multi-timeframe agreement, sector-relative strength.
3. Run April 500 deep scan on finalists only (capped per run).
4. Emit `SwingEvidencePacket` with deterministic evidence and counter-evidence.

Hard blockers:

- Stale market data beyond run-mode TTL.
- Average dollar volume below threshold.
- Spread too wide.
- Missing required price history.

### Agent A2 — Swing Critique

Role:
Challenge every setup A1 produces. Adversarial review that catches bad geometry, event risk, stale data, liquidity holes, and correlation concentration.

Primary outputs:

- `SwingCritiquePacket`
- `SwingCriticScore`

Process:

1. Validate stop geometry: entry zone, invalidation level, ATR distance, risk/reward.
2. Check event risk: earnings within 48h, FOMC, CPI, major sector events.
3. Verify signal freshness: no stale prints, no missing intraday bars.
4. Test liquidity adequacy for hypothetical research size.
5. Check correlation against already-accepted ideas in the same run.

Hard blockers:

- No definable stop.
- Earnings within 48 hours.
- Stale data on required timeframes.
- Liquidity below configured floor.

### Swing Orchestrator

Role:
Coordinate A1 and A2, compute the combined score, decide accept/watchlist/mutate/reject, and enforce iteration budget.

Primary outputs:

- `SwingRun`
- `SwingIteration`
- `FinalSwingDecision`

Decision logic:

1. Compute `swing_total_score = 0.50 * A1_score + 0.50 * A2_score - penalties`.
2. If `score >= accept_threshold` and no hard blockers → `accept`.
3. If `watchlist_threshold <= score < accept_threshold` → `watchlist` or `mutate_and_retry` (max 3–5 iterations).
4. If `score < reject_threshold` → `reject` with reason.

Mutations:

- `timeframe_expand` / `timeframe_contract`
- `sector_relative_check`
- `risk_filter_tighten`
- `volatility_regime_adjust`
- `deep_scan_extra_period`
- `counter_evidence_expand`

### Swing Scoring

```text
swing_total_score =
    0.50 * swing_discovery_score   (A1)
  + 0.50 * swing_critic_score      (A2)
  - risk_penalty
  - stale_data_penalty
```

Penalty caps:

- `risk_penalty`: 0.0–0.35
- `stale_data_penalty`: 0.0–0.30
- `total_penalty_cap`: 0.55

Default thresholds:

- `accept_threshold`: 0.78
- `watchlist_threshold`: 0.62
- `reject_threshold`: 0.45
- `max_iterations_per_candidate`: 5

---

## System 2: Growth (2 Months – 10+ Years)

**Tax weight: 10%. Growth potential dominates. Tax only matters as downside protection.**

### Agent B1 — Quality & Durability (90% weight)

Role:
Find businesses with the highest compounding potential. This is the dominant agent in System 2.

Primary outputs:

- `GrowthEvidencePacket`
- `GrowthQualityScore`

Process:

1. Fetch financial statements (5+ years of income statement, balance sheet, cash flow).
2. Score revenue growth trajectory (slope, consistency, deceleration).
3. Score earnings growth quality (margin trend, accruals quality).
4. Score ROIC trend and absolute level.
5. Assess competitive moat durability (network effects, switching costs, scale, brand, IP).
6. Evaluate capital allocation history (buybacks vs. dilution, M&A discipline, dividend policy).
7. Check management alignment: insider activity, compensation structure, ownership.
8. Assess valuation discipline: margin of safety vs. estimated intrinsic value.
9. Stress-test the balance sheet (leverage, interest coverage, refinancing risk).

Output direction: `accumulate | hold | trim | avoid`.

Hard rejections (override score):

- Revenue declining 2+ years with no clear cyclical recovery thesis.
- No credible path to positive free cash flow within configured horizon.
- Going-concern doubt, restatement, or fraud indicators.
- Insider cluster selling (multiple insiders selling within a tight window).

### Agent B2 — Risk-Aware Tax (10% weight)

Role:
Apply tax as **downside protection only**, not as a primary filter.

Core principle:
Tax only matters if it threatens the return. A great company growing at 15% that gets taxed to 11% net is still great. A mediocre company growing at 5% that gets taxed to 2% net loses to inflation — that's a risk-of-loss problem.

Primary outputs:

- `GrowthTaxRiskPacket`
- `GrowthTaxRiskScore`

Process:

1. Estimate after-tax downside scenario (50% of B2's internal weight).
2. Evaluate asset-location fit: taxable vs. retirement vs. Roth vs. HSA (25%).
3. Check dividend tax efficiency: qualified dividend share, payout policy (15%).
4. Assess exit flexibility: lot structure, holding-period clock, wash-sale exposure (10%).

Key question: "Will taxes turn this into a losing investment?" If no, B2 contributes a small positive bump. If yes, B2 contributes a meaningful penalty.

Hard blockers (escalate to `needs_review`):

- Taxable account with missing tax profile.
- Wash-sale status `blocked`.
- Tax complexity that requires CPA review (complex options, PFIC, K-1).

### Growth Orchestrator

Role:
Coordinate B1 and B2, compute the combined score, decide accept/watchlist/mutate/reject, and enforce iteration budget.

Primary outputs:

- `GrowthRun`
- `GrowthIteration`
- `FinalGrowthDecision`

Decision logic:

1. Compute `growth_total_score = 0.90 * B1_score + 0.10 * B2_score - penalties`.
2. If `score >= accept_threshold` and no hard blockers → `accept`.
3. If close but improvable → `mutate_and_retry` (max 3–5 iterations).
4. If `score < reject_threshold` or B1 hard rejection → `reject` with reason.

Mutations:

- `valuation_stress_test`
- `competitive_deep_dive`
- `management_review`
- `balance_sheet_stress`
- `asset_location_compare`
- `dividend_efficiency_check`

### Growth Scoring

```text
growth_total_score =
    0.90 * growth_quality_score    (B1)
  + 0.10 * growth_tax_risk_score   (B2)
  - quality_risk_penalty
  - tax_complexity_penalty
```

Penalty caps:

- `quality_risk_penalty`: 0.0–0.35
- `tax_complexity_penalty`: 0.0–0.20 (capped lower than swing because tax weight is small)
- `total_penalty_cap`: 0.45

Default thresholds:

- `accept_threshold`: 0.75
- `watchlist_threshold`: 0.60
- `reject_threshold`: 0.45
- `max_iterations_per_candidate`: 4

---

## Shared Infrastructure

Both systems share infrastructure but never share scoring logic.

| Component | Used By | Notes |
| --- | --- | --- |
| GCP3 cache, feature modules, `data_client.py` | Both | Same yfinance throttling, TTL rules |
| Provider router (OpenRouter/Qwen3 → Mistral → Gemini) | Both | Same `structured_llm_call` interface |
| `ToolResult` schema | Both | Universal tool output contract |
| Firestore persistence | Both | Separate collections per system |
| Frontend shell | Both | Separate tabs |
| April 500 adapter | Swing only | Technical deep scan |
| Financial statement adapter | Growth only | Fundamental deep scan |

### Generic Tool Contract

Every scanner, feature module, RAG lookup, tax calculator, fundamental analyzer, or LLM critique must emit:

```json
{
  "tool_name": "string",
  "tool_family": "market_data|technical_signal|deep_scan|fundamental|tax|rag|macro|news|risk|llm|storage",
  "inputs_hash": "string",
  "timeframe": "1d|5d|1m|3m|6m|1y|5y|custom",
  "status": "ok|partial|failed|stale|skipped",
  "score_delta": 0.0,
  "evidence": [],
  "counter_evidence": [],
  "risk_flags": [],
  "source_timestamps": {},
  "computed_at": "ISO-8601"
}
```

---

## Data Contracts

### Swing System

#### `SwingEvidencePacket` (A1 output)

```json
{
  "ticker": "string",
  "direction": "long|short|neutral|avoid",
  "horizon": "intraday|2d-5d|1w-3w|1m-2m",
  "timeframes_checked": ["1d", "5d", "1m", "3m"],
  "feature_scores": {
    "trend": 0.0,
    "momentum": 0.0,
    "volume": 0.0,
    "volatility_quality": 0.0,
    "sector_relative": 0.0,
    "multi_timeframe_agreement": 0.0,
    "april500": 0.0
  },
  "swing_discovery_score": 0.0,
  "supporting_evidence": [],
  "counter_evidence": [],
  "risk_flags": [],
  "source_freshness": {},
  "deterministic_summary": "string",
  "llm_summary": "string|null",
  "ai_degraded": false
}
```

#### `SwingCritiquePacket` (A2 output)

```json
{
  "ticker": "string",
  "stop_geometry": {
    "entry_zone": "string|null",
    "invalidation_level": "number|null",
    "atr_distance": "number|null",
    "risk_reward_estimate": "number|null"
  },
  "event_risk": {
    "earnings_within_48h": false,
    "fomc_within_48h": false,
    "sector_events": []
  },
  "liquidity_check": "pass|warn|fail",
  "correlation_to_accepted": 0.0,
  "critic_findings": [],
  "risk_penalties": [],
  "swing_critic_score": 0.0,
  "verdict": "pass|watch|mutate|reject|needs_review"
}
```

#### `FinalSwingDecision`

```json
{
  "run_id": "string",
  "ticker": "string",
  "swing_total_score": 0.0,
  "decision": "accept|watchlist|reject|needs_review",
  "decision_reason": "string",
  "iterations_used": 0,
  "mutation_history": [],
  "compliance_label": "research_only"
}
```

### Growth System

#### `GrowthEvidencePacket` (B1 output)

```json
{
  "ticker": "string",
  "direction": "accumulate|hold|trim|avoid",
  "horizon": "2m-6m|6m-2y|2y-5y|5y-10y|10y-plus",
  "quality_scores": {
    "revenue_growth": 0.0,
    "earnings_quality": 0.0,
    "roic_trend": 0.0,
    "moat_durability": 0.0,
    "capital_allocation": 0.0,
    "management_alignment": 0.0,
    "valuation_discipline": 0.0,
    "balance_sheet_strength": 0.0
  },
  "growth_quality_score": 0.0,
  "hard_rejection_flags": [],
  "supporting_evidence": [],
  "counter_evidence": [],
  "source_freshness": {},
  "deterministic_summary": "string",
  "llm_summary": "string|null",
  "ai_degraded": false
}
```

#### `GrowthTaxRiskPacket` (B2 output)

```json
{
  "ticker": "string",
  "after_tax_downside_score": 0.0,
  "asset_location_fit_score": 0.0,
  "dividend_tax_efficiency_score": 0.0,
  "exit_flexibility_score": 0.0,
  "growth_tax_risk_score": 0.0,
  "key_question_answer": "tax_does_not_threaten_return|tax_threatens_return|tax_destroys_return",
  "tax_complexity_flags": [],
  "professional_review_required": false,
  "assumptions": []
}
```

#### `FinalGrowthDecision`

```json
{
  "run_id": "string",
  "ticker": "string",
  "growth_total_score": 0.0,
  "decision": "accept|watchlist|reject|needs_review",
  "decision_reason": "string",
  "iterations_used": 0,
  "mutation_history": [],
  "compliance_label": "research_only"
}
```

---

## Endpoints

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

### `POST /agents/swing/run`

```json
{
  "mode": "premarket|intraday|postmarket|manual",
  "universe": "screener|watchlist|merged|custom",
  "symbols": ["AAPL", "MSFT"],
  "max_candidates": 25,
  "max_finalists": 5,
  "include_llm": true,
  "force_refresh": false,
  "dry_run": true
}
```

### `POST /agents/growth/run`

```json
{
  "mode": "manual|scheduled",
  "universe": "quality_screener|watchlist|merged|custom",
  "symbols": ["MSFT", "GOOGL"],
  "max_candidates": 20,
  "max_finalists": 5,
  "account_bucket": "taxable|traditional_retirement|roth|hsa|paper",
  "tax_profile_id": "default",
  "min_history_years": 5,
  "include_llm": true,
  "force_refresh": false,
  "dry_run": true
}
```

---

## Firestore Collections

| Collection | Document key | System | Purpose |
| --- | --- | --- | --- |
| `swing_runs` | `run_id` | Swing | Run-level state |
| `swing_candidates` | `run_id:ticker` | Swing | Latest candidate state |
| `swing_iterations` | `run_id:ticker:iter` | Swing | Iteration audit |
| `swing_evidence_packets` | `run_id:ticker:iter` | Swing | A1 outputs |
| `swing_critique_packets` | `run_id:ticker:iter` | Swing | A2 outputs |
| `final_swing_decisions` | `run_id:ticker` | Swing | Terminal decision |
| `growth_runs` | `run_id` | Growth | Run-level state |
| `growth_candidates` | `run_id:ticker` | Growth | Latest candidate state |
| `growth_iterations` | `run_id:ticker:iter` | Growth | Iteration audit |
| `growth_evidence_packets` | `run_id:ticker:iter` | Growth | B1 outputs |
| `growth_tax_risk_packets` | `run_id:ticker:iter` | Growth | B2 outputs |
| `final_growth_decisions` | `run_id:ticker` | Growth | Terminal decision |
| `agent_tool_results` | `run_id:iter:tool:hash` | Both | Normalized tool outputs |
| `agent_llm_attempts` | `run_id:iter:agent:call:provider` | Both | Provider fallback audit |

---

## Frontend

```text
[Swing Ideas (0–2mo)]   [Growth Ideas (2mo–10yr+)]

  Accepted | Watchlist | Rejected | Needs Review

  Ticker   Score   Direction   Horizon   Evidence   Source Freshness
```

Each tab loads its own run summary first, then lazy-loads candidate iterations and provider attempts on demand. Show `ai_degraded` and stale-data labels prominently rather than hiding them.

---

## Optimization Invariants

These rules are non-negotiable across both systems:

- Broad scans use cached or cheap GCP3 features; never April 500 or financial-statement deep scans for the broad universe.
- April 500 runs only on Swing finalists (max 5 per run, max 3 timeframes per finalist).
- Financial-statement deep scans run only on Growth finalists.
- LLM calls happen only after deterministic evidence exists.
- Each system uses its own `CandidateState`; agents within a system share state, but Swing and Growth never share state.
- Every iteration must improve the score, add new evidence, or stop.
- Every expensive call has a cache key, timeout, and budget counter.
- Every provider fallback is logged once, not retried invisibly.
- The UI surfaces degraded data; it never hides it behind a polished summary.
- No execution endpoints. Research only.

---

## Build Sequence

Build the Swing system first; it's smaller and validates the shared infrastructure. Then build Growth on top of the same plumbing.

### Phase 1: Shared Foundation

1. Add `ToolResult`, `SwingRun`/`GrowthRun`, candidate state, and evidence schemas.
2. Fix GCP3 robustness: TTL compatibility, volume dispatch, missing feature dispatches, Alpha Vantage counter, yfinance throttling, `/swing-predictions` query params, structured provider errors.
3. Wrap `boll-4-april-500.py` as a normalized signal-file adapter with import-safe `main()`.
4. Add the provider-neutral LLM gateway with OpenRouter/Qwen3 → Mistral → Gemini fallback and circuit breakers.

### Phase 2: Swing System

5. Implement Agent A1 (Swing Discovery) with deterministic scoring; LLM summary optional and finalist-only.
6. Implement Agent A2 (Swing Critique) with rule-based critique first; LLM critique optional.
7. Implement Swing Orchestrator with mutation tracking and stop rules.
8. Add Swing endpoints, Firestore collections, and frontend tab.
9. Run Swing dry-run verification: 500-symbol universe → 25 candidates → 5 finalists → April 500 on finalists only → final decisions with reasons.

### Phase 3: Growth System

10. Build a financial-statement adapter (income statement, balance sheet, cash flow, 5+ year history). Reuse the `ToolResult` contract.
11. Implement Agent B1 (Quality & Durability) with deterministic quality scoring; LLM narrative optional and finalist-only.
12. Implement Agent B2 (Risk-Aware Tax) with deterministic after-tax downside math. Tax profile remains configuration; treat missing taxable lots as `needs_review`, never as zero tax drag.
13. Implement Growth Orchestrator with mutation tracking and stop rules.
14. Add Growth endpoints, Firestore collections, and frontend tab.
15. Run Growth dry-run verification: quality screener → 20 candidates → 5 finalists → financial statement deep scan → final decisions with reasons.

### Phase 4: Polish

16. Add chat over persisted run evidence for both systems (no fresh market-data calls unless explicitly requested).
17. Add scheduled premarket/postmarket Swing runs.
18. Add scheduled weekly Growth runs.
19. Calibrate thresholds with historical replay before treating any output as more than `research_accept_candidate`.

---

## Minimum Viable Loop

The smallest useful version of each system:

### Swing MVP

1. Pull top 25 GCP3 swing candidates.
2. Run lightweight features and rank top 10.
3. Run April 500 on up to 3 timeframes for top 5 finalists.
4. Produce `SwingEvidencePacket` and `SwingCritiquePacket` deterministically.
5. Compute `swing_total_score` with 50/50 weighting.
6. Iterate at most 3 times per candidate.
7. Emit `accept | watchlist | reject | needs_review` with reasons.
8. Show trajectory in the Swing tab.

### Growth MVP

1. Pull top 20 candidates from a quality screener (revenue growth, ROIC, FCF).
2. Filter for 5+ years of financial history.
3. Run financial-statement deep scan on top 5 finalists.
4. Produce `GrowthEvidencePacket` (B1) deterministically.
5. Run B2 with mocked tax profile and account bucket.
6. Compute `growth_total_score` with 90/10 weighting.
7. Iterate at most 3 times per candidate.
8. Emit `accept | watchlist | reject | needs_review` with reasons.
9. Show trajectory in the Growth tab.

---

## Done Definition

Implementation is ready when:

- Every tool output fits the generic `ToolResult` contract.
- April 500 is a replaceable signal-file adapter, not hard-coded agent logic.
- Financial-statement deep scan is a replaceable adapter for Growth.
- Both systems run in dry-run mode without LLMs.
- Swing system uses 0% tax weight; Growth system uses 10% tax weight.
- LLM calls try OpenRouter/Qwen3 first, Mistral second, Gemini third, with attempt logs and circuit breakers.
- Every promoted idea includes supporting and counter-evidence.
- Every rejected idea has explicit reason: technical, fundamental, tax-risk, stale-data, or budget.
- Recursion stops deterministically on thresholds, low improvement, repeated mutation, stale data, or budget exhaustion.
- Tax outputs in Growth show assumptions and `professional_review_required` when appropriate.
- Frontend shows score trajectory, source freshness, tool provenance, and final decision status.
- No trade execution path exists in either system.

---

## Summary Table

|                       | Swing                               | Growth                                                |
| --------------------- | ----------------------------------- | ----------------------------------------------------- |
| **Horizon**           | 0–2 months                          | 2 months – 10+ years                                  |
| **Agents**            | A1 Discovery, A2 Critique           | B1 Quality, B2 Risk-Aware Tax                         |
| **Tax weight**        | 0%                                  | 10% — downside protection only                        |
| **Primary question**  | "Is there a trade here?"            | "Can this business compound my capital?"              |
| **Hard blockers**     | No stop, earnings <48h, stale data  | Revenue decline, no FCF path, fraud, insider selling  |
| **Deep scan**         | April 500 (technical)               | Financial statement analysis (fundamental)            |
| **Score formula**     | `0.50 * A1 + 0.50 * A2 - penalties` | `0.90 * B1 + 0.10 * B2 - penalties`                   |
| **Accept threshold**  | 0.78                                | 0.75                                                  |
| **Max iterations**    | 5                                   | 4                                                     |
| **Run cadence**       | Premarket/intraday/postmarket       | Weekly                                                |

---

## ChromaDB RAG Chatbot Integration

Both systems produce large amounts of persisted evidence — tool results, agent packets, iteration histories, provider attempts, and final decisions. The RAG chatbot turns that evidence into a conversational interface: a researcher can ask "why was NVDA accepted?", "what did the critic say about stop geometry for AAPL?", or "which Growth finalists had the strongest ROIC trend?" and get answers grounded in the actual run output rather than hallucinated from training data.

### Architecture

```text
ai-text-opt-1024 frontend
  -> /chat (Next.js API route)
    -> POST /rag/chat (GCP3 or ai-text-opt-1024 RAG service)
      -> ChromaDB query (collection per system or per run)
        -> Retrieved chunks (evidence packets, summaries, decisions)
      -> Provider router (OpenRouter/Qwen3 → Mistral → Gemini)
        -> Grounded LLM response with cited chunk IDs
      -> Response with citations and source_freshness
```

ChromaDB lives in `ai-text-opt-1024` (as the RAG/memory host) or as a sidecar in GCP3. GCP3 agents never call ChromaDB directly; they write structured evidence to Firestore and emit ingest events. The RAG service subscribes to those events (or polls) and indexes new chunks after each run completes.

### What Gets Indexed

Every document ingested into ChromaDB must carry metadata that allows the chatbot to filter, cite, and explain provenance.

| Document type | Source | ChromaDB collection | Key metadata |
| --- | --- | --- | --- |
| `SwingEvidencePacket` | Firestore `swing_evidence_packets` | `swing_evidence` | `ticker`, `run_id`, `iteration`, `swing_discovery_score`, `direction`, `computed_at` |
| `SwingCritiquePacket` | Firestore `swing_critique_packets` | `swing_critique` | `ticker`, `run_id`, `iteration`, `swing_critic_score`, `verdict` |
| `FinalSwingDecision` | Firestore `final_swing_decisions` | `swing_decisions` | `ticker`, `run_id`, `decision`, `swing_total_score`, `compliance_label` |
| `GrowthEvidencePacket` | Firestore `growth_evidence_packets` | `growth_evidence` | `ticker`, `run_id`, `iteration`, `growth_quality_score`, `direction`, `computed_at` |
| `GrowthTaxRiskPacket` | Firestore `growth_tax_risk_packets` | `growth_tax_risk` | `ticker`, `run_id`, `iteration`, `growth_tax_risk_score`, `key_question_answer` |
| `FinalGrowthDecision` | Firestore `final_growth_decisions` | `growth_decisions` | `ticker`, `run_id`, `decision`, `growth_total_score`, `compliance_label` |
| Trader notes / annotations | Frontend note input | `trader_notes` | `ticker`, `note_type`, `created_at`, `author` |
| Prior rejected ideas | Both systems | `rejected_ideas` | `ticker`, `run_id`, `reject_reason`, `system` |

Chunking strategy:
- Index each packet as one chunk. Packets are already bounded in size (single ticker, single iteration). Do not split mid-packet.
- For long LLM narrative fields (`llm_summary`, `deterministic_summary`), index as a separate sub-chunk with a back-reference to the parent packet ID.
- For `mutation_history` arrays, flatten each mutation into its own chunk with `parent_decision_id`.

### ChromaDB Schema

Every chunk stored in ChromaDB must conform to this envelope so the chatbot layer can filter, cite, and explain source provenance without a secondary Firestore lookup.

```python
{
    "id": "chroma_chunk_{system}_{collection}_{doc_id}_{chunk_index}",
    "document": "string (text to embed and retrieve)",
    "metadata": {
        "system": "swing|growth",
        "collection": "swing_evidence|swing_critique|swing_decisions|growth_evidence|growth_tax_risk|growth_decisions|trader_notes|rejected_ideas",
        "ticker": "string",
        "run_id": "string",
        "iteration": "int|null",
        "decision": "accept|watchlist|reject|needs_review|null",
        "score": "float|null",
        "direction": "string|null",
        "computed_at": "ISO-8601",
        "is_stale": "bool",
        "ai_degraded": "bool",
        "compliance_label": "research_only",
        "source_doc_id": "string (Firestore document ID for full-record lookup)"
    }
}
```

### Ingest Pipeline

The ingest pipeline runs after each agent run completes. It should never block the agent run itself.

```python
async def ingest_run_to_chroma(run_id: str, system: str) -> IngestReport:
    """
    Pull all completed packets for a run from Firestore, chunk them,
    embed them, and upsert into ChromaDB. Idempotent: re-ingesting a
    run_id updates existing chunks rather than duplicating them.
    """
    packets = await firestore.get_packets_for_run(run_id, system)
    chunks = []

    for packet in packets:
        chunks.extend(chunk_packet(packet, system))

    embeddings = await embed_batch(chunks)  # uses configured embedding model
    chroma_client.upsert(collection=f"{system}_evidence", documents=chunks, embeddings=embeddings)

    return IngestReport(run_id=run_id, system=system, chunks_upserted=len(chunks))
```

Embedding model:
Default to `text-embedding-3-small` (OpenAI) or the embedding model configured in `provider_env`. Store the model name in each chunk's metadata so queries use the same model. Never mix embedding models within a collection.

Staleness handling:
If a packet is re-ingested (same `source_doc_id`), overwrite the existing chunk. Include `is_stale: true` on chunks where `source_freshness` shows expired data so the chatbot can surface this automatically.

### RAG Query Contract

The chatbot endpoint at `POST /rag/chat` (or proxied through `ai-text-opt-1024`) accepts:

```json
{
  "message": "string",
  "session_id": "string",
  "context": {
    "system_filter": "swing|growth|both",
    "ticker_filter": ["AAPL", "NVDA"],
    "run_id_filter": "string|null",
    "decision_filter": "accept|watchlist|reject|needs_review|null",
    "max_chunks": 8,
    "include_stale": false,
    "include_rejected": true
  }
}
```

Response:

```json
{
  "answer": "string",
  "citations": [
    {
      "chunk_id": "string",
      "source_doc_id": "string",
      "ticker": "string",
      "system": "swing|growth",
      "collection": "string",
      "score": 0.0,
      "computed_at": "ISO-8601",
      "is_stale": false,
      "ai_degraded": false,
      "snippet": "string (30-50 word excerpt)"
    }
  ],
  "answer_grounded": true,
  "compliance_label": "research_only",
  "provider_used": "openrouter|mistral|gemini|rule_based",
  "ai_degraded": false
}
```

`answer_grounded: false` means the LLM answered from training data rather than retrieved chunks. This should be surfaced in the UI with a warning.

### Chatbot Prompt Template

The system prompt passed to the LLM for every RAG chat turn:

```text
You are a financial research assistant. You answer questions using only the
evidence chunks provided below. You do not invent prices, scores, ticker
symbols, or tax advice. Every claim must cite a chunk_id from the provided
context. If the context does not contain enough information to answer, say
"I don't have enough evidence in the current run to answer this" rather than
guessing.

This is research tooling only. You must include "research_only" in every
response that mentions a specific ticker direction or score.

Retrieved context:
{chunks}

Trader question: {message}
```

### What the Chatbot Can and Cannot Do

| Can do | Cannot do |
| --- | --- |
| Explain why a ticker was accepted or rejected | Generate new market-data calls |
| Summarize iteration history for a candidate | Access real-time prices |
| Compare two tickers' scores within a run | Place trades or generate order tickets |
| Explain stop geometry from a `SwingCritiquePacket` | Override hard blockers |
| Explain ROIC trend from a `GrowthEvidencePacket` | Provide tax advice |
| Surface stale-data or ai_degraded warnings | Confirm a tax position |
| Cross-reference trader notes against run evidence | Access data outside the indexed run |

### Frontend Chat UI

The chat panel lives on the run detail page (not the landing page). It loads after the run summary is displayed. Auto-calling the chat endpoint on page load is prohibited — the user initiates.

```text
[Swing Run: swing_20260505_093000_premarket]

  [Score Trajectory]  [Evidence Table]  [Chat]

  Chat tab:
  ┌─────────────────────────────────────────────┐
  │ Ask about this run...                        │
  └─────────────────────────────────────────────┘

  Response + citations:
  "NVDA was accepted with swing_total_score 0.83.
   A1 discovery found strong momentum (0.91) and
   volume (0.87). A2 critique passed stop geometry
   with R/R 2.8:1. [source: swing_evidence:NVDA:003]
   [research_only]"
```

Citations must be clickable links that scroll the evidence table to the matching packet row.

### ChromaDB Collections Setup

```python
# In ai-text-opt-1024 RAG service or GCP3 rag_proxy.py
import chromadb

client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)

COLLECTIONS = [
    "swing_evidence",
    "swing_critique",
    "swing_decisions",
    "growth_evidence",
    "growth_tax_risk",
    "growth_decisions",
    "trader_notes",
    "rejected_ideas",
]

for name in COLLECTIONS:
    client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )
```

Persistence directory: configurable via `CHROMA_PERSIST_DIR` env var. Default to `./data/chroma` locally and a mounted volume path on Cloud Run. Never store ChromaDB data in `/tmp` — it is ephemeral on Cloud Run.

### Run-Scoped vs. Cross-Run Queries

The chatbot supports two query modes:

- **Run-scoped (default):** `run_id_filter` restricts retrieval to one run. Fast. Used on the run detail page. Answers like "why was NVDA accepted in this run?"
- **Cross-run:** No `run_id_filter`. Retrieves from all indexed runs. Slower. Used on the research history page. Answers like "how many times has NVDA been accepted in the last 30 days?"

Cross-run queries must include a date-range guard in the metadata filter to avoid unbounded ChromaDB scans.

### Research-Only Enforcement at the RAG Layer

The RAG chatbot is a second execution boundary for the research-only rule. Even if a bug in the agent layer produced an execution-flavored output, the chatbot must not relay or amplify it.

Implementation:
- The system prompt explicitly bans execution language.
- The response schema includes `compliance_label: research_only` on every response.
- Any response containing phrases like "buy X shares", "place an order", "execute the trade", "sell at market" must be intercepted by a post-processing filter before reaching the frontend. Log the intercept and return a sanitized response with a `compliance_violation_detected: true` flag.

```python
EXECUTION_PHRASES = [
    "buy X shares", "place an order", "execute the trade",
    "sell at market", "limit order", "stop loss order",
    "enter the position", "exit the position",
]

def sanitize_rag_response(response: str) -> tuple[str, bool]:
    violation = any(phrase in response.lower() for phrase in EXECUTION_PHRASES)
    if violation:
        return "This response was filtered. Research output only.", True
    return response, False
```

This filter runs in the RAG service before the response is serialized, so it applies regardless of which LLM provider produced the text.

---

## Growth Candidate Universe Specification

The Growth system said "quality screener" without defining the input. This section defines it concretely.

### Broad Universe Sources (run in order, deduplicate by ticker)

1. **S&P 500 constituent list** — baseline of large-cap, liquid businesses with 5+ year history. Source: GCP3 `screener.py` or a cached static list refreshed weekly.
2. **Quality momentum screener** — filter the broad market for stocks with revenue CAGR > 8% over 3 years, ROIC > 10% in the most recent annual period, and FCF yield > 0%. Source: Alpha Vantage fundamentals API or Financial Modeling Prep (FMP) fundamentals endpoint.
3. **User watchlist** — user-submitted tickers that bypass the screener filter but still go through B1 hard-rejection checks.
4. **Prior accepted/watchlist tickers** — re-evaluate tickers that scored above `watchlist_threshold` in the last 4 weekly runs to track score trajectory over time.

### Pre-filter Before B1 Deep Scan

Apply these cheap filters before fetching 5+ years of financial statements:

| Filter | Threshold | Source |
| --- | --- | --- |
| Min average daily dollar volume | $50M | GCP3 market data |
| Min years of financial history | 5 | FMP or Alpha Vantage annual data count |
| No going-concern audit opinion in last 2 years | flag present | SEC EDGAR filing text or FMP flag |
| Revenue not declining 2+ consecutive years | hard reject | Annual revenue array, last 3 data points |
| Not a SPAC or shell company | flag present | GCP3 company type field |

Output: Up to `growth_candidate_limit` (default 20) symbols cleared for B1 deep scan.

### Data Sources

| Data type | Primary source | Fallback |
| --- | --- | --- |
| Annual income statement (5+ years) | Financial Modeling Prep (FMP) `/financials/income-statement` | Alpha Vantage `INCOME_STATEMENT` |
| Annual balance sheet (5+ years) | FMP `/financials/balance-sheet-statement` | Alpha Vantage `BALANCE_SHEET` |
| Annual cash flow (5+ years) | FMP `/financials/cash-flow-statement` | Alpha Vantage `CASH_FLOW` |
| Quarterly revenue (last 8 quarters) | FMP `/financials/income-statement?period=quarter` | Alpha Vantage quarterly |
| Insider transactions (last 90 days) | FMP `/insider-trading` | SEC Form 4 via EDGAR |
| Institutional ownership | FMP `/institutional-holder` | Optional; used for management alignment |
| Dividend history | FMP `/historical-price-full/stock_dividend` | yfinance |

All financial-statement fetches must go through the GCP3 `data_client.py` pattern: rate-limited, cached with run-mode TTL, and normalized into lowercase column names before agent processing. Financial statements change quarterly; use a `financial_ttl_seconds: 604800` (7 days) default for weekly Growth runs.

---

## B1 Scoring Calibration Rules

The `growth_quality_score` is a weighted average of eight sub-scores. Each sub-score maps a raw metric to `0.0–1.0`. These rules are the first-pass calibration. They must be revised after 20+ dry runs produce enough outcome data to compare scores against forward 12-month returns.

### Revenue Growth Score (weight: 0.15)

Metric: 3-year revenue CAGR (compound annual growth rate).

| CAGR | Score |
| --- | --- |
| ≥ 25% | 1.00 |
| 20–24.9% | 0.90 |
| 15–19.9% | 0.80 |
| 10–14.9% | 0.65 |
| 5–9.9% | 0.50 |
| 0–4.9% | 0.30 |
| Negative | 0.05 |

Deceleration penalty: if the most recent annual growth rate is more than 5 percentage points below the 3-year CAGR, subtract 0.10. Cap at 0.0.

### Earnings Quality Score (weight: 0.15)

Metric: FCF conversion = (Free Cash Flow) / (Net Income), averaged over 3 years.

| FCF conversion | Score |
| --- | --- |
| ≥ 1.20 | 1.00 |
| 1.00–1.19 | 0.85 |
| 0.80–0.99 | 0.70 |
| 0.60–0.79 | 0.50 |
| 0.40–0.59 | 0.30 |
| < 0.40 or negative | 0.10 |

Accruals penalty: if accruals ratio (Net Income − Operating CFO) / Total Assets > 0.05, subtract 0.10. High accruals suggest earnings are not backed by cash.

### ROIC Trend Score (weight: 0.20)

Metric: ROIC = (EBIT × (1 − tax_rate)) / (Total Equity + Total Debt − Cash), most recent annual period.

| ROIC absolute | Base score |
| --- | --- |
| ≥ 25% | 1.00 |
| 20–24.9% | 0.88 |
| 15–19.9% | 0.75 |
| 10–14.9% | 0.60 |
| 5–9.9% | 0.35 |
| < 5% | 0.10 |

Trend modifier: if ROIC has improved for 3 consecutive years, add 0.10. If it has declined for 2+ years, subtract 0.10. Cap at 0.0–1.0.

### Moat Durability Score (weight: 0.15)

This score is the most judgment-intensive. Use LLM critique (B1's optional LLM call) for finalists; use a rule-based proxy for broad candidates.

Rule-based proxy (pre-finalist):

| Signal | Points |
| --- | --- |
| Gross margin > 50% | +0.25 |
| Gross margin > 35% | +0.15 |
| Revenue CAGR > 15% and gross margin stable or improving | +0.20 |
| Net revenue retention proxy: sequential quarterly revenue growth > 0 for 6+ consecutive quarters | +0.20 |
| R&D as % of revenue > 10% (suggests IP moat) | +0.10 |
| Customer concentration: no single customer > 20% of revenue (if disclosed) | +0.10 |

Cap at 1.00. If LLM is available and the rule-based score is between 0.40–0.70 (ambiguous range), allow LLM critique to adjust by ±0.15 with reasoning.

### Capital Allocation Score (weight: 0.10)

Metric: Combination of dilution control and capital deployment quality.

| Signal | Points |
| --- | --- |
| Share count has not grown more than 5% over 5 years | +0.30 |
| Share count has declined (buyback-positive) | +0.40 |
| Capex as % of revenue is stable or declining while revenue grows | +0.15 |
| Dividend payout ratio < 50% if dividends paid (preserves reinvestment flexibility) | +0.15 |

### Management Alignment Score (weight: 0.10)

| Signal | Points |
| --- | --- |
| No insider cluster selling in the last 90 days | +0.40 |
| CEO or founder ownership > 5% of outstanding shares | +0.30 |
| No executive compensation abnormality (stock-based comp < 3% of revenue) | +0.30 |

Cluster selling defined as: 3+ distinct insiders filing Form 4 sales within a 30-day window.

### Valuation Discipline Score (weight: 0.10)

Metric: Price-to-FCF relative to growth rate (PEG-FCF proxy).

| FCF yield | Score |
| --- | --- |
| ≥ 5% | 1.00 |
| 3–4.9% | 0.80 |
| 2–2.9% | 0.60 |
| 1–1.9% | 0.40 |
| < 1% | 0.15 |

Override: if FCF is negative but revenue CAGR > 25% and gross margin > 60%, do not score on yield; instead score as 0.55 (high-growth, pre-profit exception). Flag with `valuation_exception: pre_profit_growth`.

### Balance Sheet Strength Score (weight: 0.05)

| Signal | Points |
| --- | --- |
| Net cash positive (cash > total debt) | +0.50 |
| Debt-to-EBITDA < 2.0 | +0.30 |
| Interest coverage ratio > 5× | +0.20 |

If net debt > 3× EBITDA or interest coverage < 2×, apply a hard warning flag `leverage_risk: true`. Do not automatically reject, but require the B1 LLM critique to explain the leverage thesis before finalizing.

### B1 Composite Score Formula

```text
growth_quality_score =
    0.15 * revenue_growth_score
  + 0.15 * earnings_quality_score
  + 0.20 * roic_trend_score
  + 0.15 * moat_durability_score
  + 0.10 * capital_allocation_score
  + 0.10 * management_alignment_score
  + 0.10 * valuation_discipline_score
  + 0.05 * balance_sheet_strength_score
```

Weights sum to 1.00. Hard-rejection flags override the score entirely regardless of numeric value.

---

## April 500 Adapter Contract (Complete Field Definition)

The adapter contract was previously described without defining its output fields. This section specifies every field the adapter must produce so Swing agents can consume April 500 output without knowing how the script works internally.

### `April500ToolResult` (extends `ToolResult`)

```json
{
  "tool_name": "april500",
  "tool_family": "deep_scan",
  "adapter_version": "string",
  "ticker": "string",
  "period": "1mo|3mo|6mo|1y",
  "inputs_hash": "string (sha256 of ticker + period + source_data_timestamp)",
  "status": "ok|partial|failed|stale|skipped",
  "computed_at": "ISO-8601",
  "source_data_timestamp": "ISO-8601",
  "is_stale": false,

  "net_score": 0.0,
  "net_score_direction": "bullish|bearish|neutral",

  "signals": {
    "bollinger": {
      "band_position": "above_upper|within|below_lower",
      "squeeze": false,
      "score": 0.0
    },
    "rsi": {
      "value": 0.0,
      "zone": "overbought|neutral|oversold",
      "score": 0.0
    },
    "macd": {
      "histogram_direction": "positive|negative|flat",
      "crossover_recent": false,
      "score": 0.0
    },
    "ichimoku": {
      "price_vs_cloud": "above|inside|below",
      "cloud_color": "bullish|bearish",
      "score": 0.0
    },
    "volume_flow": {
      "obv_trend": "up|flat|down",
      "cmf_value": 0.0,
      "score": 0.0
    }
  },

  "bar_confluence": {
    "bars_checked": 0,
    "bars_with_majority_signal_alignment": 0,
    "confluence_ratio": 0.0,
    "strongest_alignment_bar": "ISO-8601|null"
  },

  "support_resistance": {
    "nearest_support": 0.0,
    "nearest_resistance": 0.0,
    "price_to_support_pct": 0.0,
    "price_to_resistance_pct": 0.0,
    "proximity_score": 0.0
  },

  "multi_timeframe_outlook": {
    "short_term": "bullish|bearish|neutral",
    "medium_term": "bullish|bearish|neutral",
    "long_term": "bullish|bearish|neutral",
    "agreement": "aligned|mixed|conflicting"
  },

  "risk_flags": [],
  "evidence": [],
  "counter_evidence": [],

  "files": {
    "report_path": "/tmp/april500/{run_id}/{ticker}_{period}_report.md",
    "chart_path": "/tmp/april500/{run_id}/{ticker}_{period}_chart.png"
  },
  "files_persisted": false,

  "score_delta": 0.0,
  "source_timestamps": {
    "price_data": "ISO-8601",
    "volume_data": "ISO-8601"
  }
}
```

`net_score` is the adapter's single normalized `0.0–1.0` output. The Swing scoring formula uses this as the `april500` feature score. Individual signal sub-scores are informational and available for LLM critique but are not directly wired into the scoring formula.

`files_persisted: false` means report and chart files were written to `/tmp` for this run but not uploaded to permanent storage. Set to `true` if GCP3 uploads them to Cloud Storage after run completion.

---

## Growth Run Cadence and Scheduling

The Swing system runs on market-hours cadences (premarket, intraday, postmarket). Growth runs on a fundamentals cadence because financial statements change quarterly, not daily.

### Default Growth Schedule

| Trigger | When | Mode | Notes |
| --- | --- | --- | --- |
| Weekly scheduled scan | Sunday 18:00 UTC | `scheduled` | Re-score all watchlist + accepted tickers plus quality screener top 20 |
| Post-earnings re-score | Within 24h of any accepted/watchlist ticker's earnings release | `post_earnings` | Narrow to just the tickers with new data; force `force_refresh: true` |
| Manual | Any time | `manual` | User-initiated from frontend; dry-run default |
| Quarterly deep review | First Sunday of each calendar quarter | `quarterly` | Full re-scan of all tickers with 5+ year history update; re-calibrate score thresholds |

### Growth Run ID Format

```text
growth_{YYYYMMDD}_{HHMMSS}_{mode}

Examples:
  growth_20260601_180000_scheduled
  growth_20260516_142300_post_earnings
  growth_20260505_090000_manual
  growth_20260601_180000_quarterly
```

### Score Trajectory Tracking

Because Growth runs weekly, the system can track how a ticker's score changes over time. The Growth Orchestrator should read `FinalGrowthDecision` documents for the same ticker from the last 4 runs before writing a new decision. If the score has declined for 3 consecutive runs, emit `score_trend: deteriorating` and escalate to `watchlist` or `needs_review` even if the current score would otherwise produce `accept`.

```json
{
  "ticker": "MSFT",
  "score_trend": "improving|stable|deteriorating|insufficient_history",
  "trend_window_runs": 4,
  "prior_scores": [0.81, 0.82, 0.84, 0.85],
  "trend_direction": "improving"
}
```

This trajectory record is included in `FinalGrowthDecision` and indexed into ChromaDB for cross-run chat queries.

---

## Research-Only Enforcement Hardening

Both the original guide and the first version of this doc used `FINANCE_RESEARCH_ONLY=true` as a config flag. That is necessary but not sufficient. This section adds enforcement layers that survive a misconfigured flag.

### Layer 1: CI/CD Grep Check

Add a CI step that greps every Python and TypeScript file for execution-flavored patterns before merge:

```bash
# .github/workflows/research_only_check.yml or equivalent
grep -rn \
  -e "place_order\|submit_order\|execute_trade\|buy_market\|sell_market\|limit_order\|stop_order\|broker_submit" \
  --include="*.py" --include="*.ts" --include="*.tsx" \
  gcp3/backend/ frontend/src/ \
  && echo "FAIL: execution language found" && exit 1 \
  || echo "PASS: no execution language found"
```

This check fails the build if any execution-flavored function name appears in the codebase. It is not a substitute for code review but catches accidental additions.

### Layer 2: Schema Invariant

Every `FinalSwingDecision` and `FinalGrowthDecision` object must include `"compliance_label": "research_only"`. Pydantic validators enforce this:

```python
from pydantic import BaseModel, field_validator

class FinalSwingDecision(BaseModel):
    compliance_label: str = "research_only"

    @field_validator("compliance_label")
    @classmethod
    def must_be_research_only(cls, v: str) -> str:
        if v != "research_only":
            raise ValueError("compliance_label must be research_only")
        return v
```

If any code path tries to serialize a decision with a different label, Pydantic raises before Firestore writes.

### Layer 3: Endpoint Response Wrapper

Every `/agents/swing/*` and `/agents/growth/*` endpoint response must include `"research_only": true` at the top level. GCP3 middleware injects this:

```python
@app.middleware("http")
async def add_research_only_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Research-Only"] = "true"
    return response
```

The frontend checks for this header and displays a persistent banner if it is absent, rather than silently proceeding.

### Layer 4: RAG Chatbot Post-Filter

Defined in the ChromaDB RAG section above: execution-phrase detection runs on every chatbot response before it reaches the frontend. Violations are logged with `compliance_violation_detected: true`.

### Layer 5: Frontend Label

Every ticker card, score row, and evidence panel must display `[Research Only]` in the UI. This label is not conditional on a config flag; it is hardcoded into the component render.

---

## Tax Reference Anchors For Config Review

Use these only as review anchors for configurable tax-rule modules. The app should not present itself as a tax preparer.

- IRS Topic no. 409, Capital gains and losses: https://www.irs.gov/taxtopics/tc409
- IRS Publication 550, Investment Income and Expenses: https://www.irs.gov/publications/p550
- IRS Topic no. 703, Basis of assets: https://www.irs.gov/taxtopics/tc703
