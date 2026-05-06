# Swing + Growth Frontend Pages: Phased Implementation Guide

Generated: 2026-05-05

Source guide:

- [swing-and-growth-pipeline-optimized.md](./swing-and-growth-pipeline-optimized.md)

Target repo:

- `/Users/adamaslan/code/ai-text-opt-1024/frontend`

## What This Doc Covers

Two new frontend pages, one per system from the pipeline guide:

- **`SwingPage.tsx`** — System 1: A1 Discovery + A2 Critique, 0–2 month horizon, tax weight 0%
- **`GrowthPage.tsx`** — System 2: B1 Quality & Durability + B2 Risk-Aware Tax, 2 month – 10+ year horizon, tax weight 10%

Both pages share infrastructure (proxy routes, types, run summary components, evidence tables, RAG chat panel) but render different evidence shapes and never share scoring logic. The implementation is phased so each phase produces a working page that can be demoed before the next phase begins.

## Existing Frontend Context

The current app at [App.tsx](../frontend/src/App.tsx) has three pages: `SuperAppPage`, `ChatPage`, `PredictionsPage`. The `Page` union type is designed to extend without router restructuring. We will add `"swing"` and `"growth"` to that union and two nav buttons.

Existing reusable components live in [frontend/src/components/](../frontend/src/components/):
- `ChatMessage.tsx` — reusable for the RAG chat panel
- `SourcesPanel.tsx` — reusable for citation display

## Architecture Overview

```text
[Nav: AI Alpha OS | Trader Chat | Predictions | Swing Ideas | Growth Ideas]

SwingPage.tsx                          GrowthPage.tsx
  ├─ RunSelector                         ├─ RunSelector
  ├─ RunSummaryCard                      ├─ RunSummaryCard
  ├─ DecisionTabs                        ├─ DecisionTabs
  │   (Accepted | Watchlist |            │   (Accepted | Watchlist |
  │    Rejected | Needs Review)          │    Rejected | Needs Review)
  ├─ CandidateTable                      ├─ CandidateTable
  │   (Ticker | Score | Direction |      │   (Ticker | Score | Direction |
  │    Horizon | Freshness | Actions)    │    Horizon | Trend | Freshness)
  ├─ CandidateDetailPanel                ├─ CandidateDetailPanel
  │   ├─ ScoreTrajectory                 │   ├─ ScoreTrajectory
  │   ├─ EvidenceAccordion               │   ├─ EvidenceAccordion
  │   │   (A1 SwingEvidencePacket)       │   │   (B1 GrowthEvidencePacket)
  │   ├─ CritiqueAccordion               │   ├─ TaxRiskAccordion
  │   │   (A2 SwingCritiquePacket)       │   │   (B2 GrowthTaxRiskPacket)
  │   └─ MutationHistory                 │   └─ MutationHistory
  └─ ChatPanel (RAG, run-scoped)         └─ ChatPanel (RAG, run-scoped)
```

Each page calls Next.js proxy routes that forward to GCP3:

```text
SwingPage   → /api/swing/runs            → GCP3 /agents/swing/latest
            → /api/swing/runs/:run_id    → GCP3 /agents/swing/{run_id}
            → /api/swing/runs/:run_id/chat → GCP3 /agents/swing/{run_id}/chat

GrowthPage  → /api/growth/runs           → GCP3 /agents/growth/latest
            → /api/growth/runs/:run_id   → GCP3 /agents/growth/{run_id}
            → /api/growth/runs/:run_id/chat → GCP3 /agents/growth/{run_id}/chat
```

---

## Phase 0: Type Definitions and Shared Plumbing

**Goal:** Establish TypeScript types matching the pipeline data contracts and the shared components both pages will consume. No UI rendering yet.

**Why first:** Both pages depend on the same types and shared components. Building these once prevents duplication and locks in the contract before page-specific work begins.

**Deliverables:**

1. `frontend/src/types/swing.ts`
   - `SwingEvidencePacket`
   - `SwingCritiquePacket`
   - `FinalSwingDecision`
   - `SwingRun`
   - `SwingIteration`
   - `SwingRunSummary` (response shape from `/api/swing/runs`)

2. `frontend/src/types/growth.ts`
   - `GrowthEvidencePacket`
   - `GrowthTaxRiskPacket`
   - `FinalGrowthDecision`
   - `GrowthRun`
   - `GrowthIteration`
   - `GrowthRunSummary`
   - `ScoreTrajectory` (4-run trend record from the pipeline doc)

3. `frontend/src/types/shared.ts`
   - `ToolResult`
   - `RagCitation`
   - `RagResponse`
   - `ProviderAttempt`
   - `Decision = "accept" | "watchlist" | "reject" | "needs_review"`
   - `ComplianceLabel = "research_only"` (literal type)

4. `frontend/src/lib/api/swingClient.ts` and `growthClient.ts`
   - Thin fetch wrappers, no caching yet
   - Functions: `fetchLatestRun()`, `fetchRun(runId)`, `chat(runId, message)`, `triggerRun(params)`

5. `frontend/src/components/shared/`
   - `ResearchOnlyBanner.tsx` — checks `X-Research-Only` header, shows persistent warning if absent
   - `ComplianceLabel.tsx` — renders `[Research Only]` chip; hardcoded, never conditional
   - `StaleDataBadge.tsx` — renders when `is_stale: true`
   - `AiDegradedBadge.tsx` — renders when `ai_degraded: true`
   - `SourceFreshness.tsx` — formatted `computed_at` with relative time

**Acceptance:**
- `npm run typecheck` passes
- All types match the JSON contracts in the pipeline doc exactly (run a literal diff)
- Compliance components render correctly with mock props in Storybook or a scratch page

---

## Phase 1: Swing Page Skeleton (`SwingPage.tsx`)

**Goal:** A working Swing page that lists runs, lets the user pick one, and shows a flat candidate table. No detail panel, no chat, no charts. End of phase: a researcher can see "this run produced 5 accepted, 3 watchlist, 12 rejected ideas" and click through tickers.

**Why before Growth:** Swing is the simpler shape (no quarterly trajectory, no fundamental data, fewer evidence fields). Building Swing first validates the proxy + types + table pattern.

**Deliverables:**

1. `frontend/src/pages/SwingPage.tsx`
   - Top-level layout
   - Calls `swingClient.fetchLatestRun()` on mount
   - Renders nav, run selector, summary card, decision tabs, candidate table

2. `frontend/src/components/swing/SwingRunSummary.tsx`
   - Props: `SwingRunSummary`
   - Shows: `run_id`, `mode`, `started_at`, `completed_at`, status, counts (`accepted`, `watchlist`, `rejected`, `needs_review`), budget (`llm_calls_used`, `april500_calls_used`)
   - Highlights `provider_cost_estimate_usd` and `max_duration_seconds` if exceeded

3. `frontend/src/components/swing/SwingDecisionTabs.tsx`
   - Tabs: `All | Accepted | Watchlist | Rejected | Needs Review`
   - Filters the candidate list client-side (server returns all)
   - Counts on each tab badge

4. `frontend/src/components/swing/SwingCandidateTable.tsx`
   - Columns: `Ticker | Direction | Horizon | Score | A1 | A2 | Iterations | Freshness | Actions`
   - Sortable by `swing_total_score` desc by default
   - Row click → currently a no-op (placeholder for Phase 2)
   - Virtualized if more than 50 rows
   - Each row shows `[Research Only]` chip and `StaleDataBadge` when applicable

5. Update `App.tsx`:
   - Extend `Page` union to include `"swing"`
   - Add nav button `"Swing Ideas"`
   - Wire conditional render

6. `frontend/pages/api/swing/runs.ts` and `frontend/pages/api/swing/runs/[run_id].ts`
   - Next.js proxy routes
   - Forward to GCP3, preserve `X-Research-Only` header

**Acceptance:**
- Page loads without errors against a mocked GCP3 response (committed fixture)
- Decision tabs filter correctly
- Candidate table sorts by score
- `[Research Only]` label visible on every row
- `npm run typecheck` and `npm run build` pass

**Out of scope this phase:**
- Detail panel (Phase 2)
- Chat (Phase 4)
- Triggering new runs from UI (Phase 5)

---

## Phase 2: Swing Candidate Detail Panel

**Goal:** Clicking a row opens a detail panel showing score trajectory and full evidence. The researcher can see *why* a candidate scored what it did.

**Deliverables:**

1. `frontend/src/components/swing/SwingCandidateDetailPanel.tsx`
   - Slide-in or modal layout, dismissible
   - Lazy-loads detailed iteration data on open (separate API call: `/api/swing/runs/:run_id/candidate/:ticker`)

2. `frontend/src/components/shared/ScoreTrajectory.tsx`
   - Reusable for both Swing and Growth
   - Line chart of score across iterations
   - X-axis: iteration number (Swing) or run date (Growth — used in Phase 7)
   - Y-axis: 0.0–1.0 with threshold lines at `accept_threshold` and `reject_threshold`
   - Annotates each point with the mutation applied
   - Uses recharts or an existing chart lib already in the repo (check first; do not add a new dep without confirming)

3. `frontend/src/components/swing/SwingEvidenceAccordion.tsx`
   - Renders one `SwingEvidencePacket` per iteration
   - Sections: feature scores (radar or bar chart), supporting evidence list, counter-evidence list, risk flags, source freshness, deterministic summary, optional LLM summary with `AiDegradedBadge`
   - April 500 sub-section when `feature_scores.april500 > 0`: shows `net_score`, signal breakdown (Bollinger/RSI/MACD/Ichimoku/volume flow), bar confluence ratio, support/resistance proximity

4. `frontend/src/components/swing/SwingCritiqueAccordion.tsx`
   - Renders one `SwingCritiquePacket` per iteration
   - Stop geometry block (entry zone, invalidation, ATR distance, R/R)
   - Event risk block (earnings <48h flag prominent)
   - Liquidity check status
   - Correlation to already-accepted ideas
   - Critic findings and risk penalties as itemized list
   - Verdict chip (`pass | watch | mutate | reject | needs_review`)

5. `frontend/src/components/swing/SwingMutationHistory.tsx`
   - Shows the chain of mutations applied across iterations
   - Each entry: iteration number, mutation type, value, reason
   - Visually distinguishes terminal mutations from continuing ones

**Acceptance:**
- Clicking a row opens the panel within 200ms (no chart calculation blocks)
- All accordion sections render with mock data
- Score trajectory chart shows correct threshold lines
- Stale-data and ai-degraded badges propagate correctly into nested sections

---

## Phase 3: Growth Page Skeleton (`GrowthPage.tsx`)

**Goal:** Mirror Phase 1 for Growth. Same structure, different fields. By end of phase, the Growth tab loads and shows a candidate table for a Growth run.

**Deliverables:**

1. `frontend/src/pages/GrowthPage.tsx` — same structural pattern as Swing

2. `frontend/src/components/growth/GrowthRunSummary.tsx`
   - Same shape as `SwingRunSummary` but with Growth-specific budget fields (no April 500 calls; instead `financial_statement_calls_used`)
   - Shows the run mode: `manual | scheduled | post_earnings | quarterly`

3. `frontend/src/components/growth/GrowthDecisionTabs.tsx` — identical to Swing version, parameterized by type

4. `frontend/src/components/growth/GrowthCandidateTable.tsx`
   - Columns: `Ticker | Direction | Horizon | Score | B1 | B2 | Trend | Iterations | Freshness | Actions`
   - The `Trend` column is unique to Growth: shows `improving | stable | deteriorating | insufficient_history` from `score_trajectory`
   - Direction values: `accumulate | hold | trim | avoid` (different from Swing's long/short/neutral/avoid)

5. Update `App.tsx`:
   - Extend `Page` union to include `"growth"`
   - Add nav button `"Growth Ideas"`

6. Next.js proxy routes for Growth: `/api/growth/runs.ts` and `/api/growth/runs/[run_id].ts`

**Acceptance:**
- Growth page loads alongside Swing without conflicts
- Trend column renders for tickers with prior runs and shows `insufficient_history` for new tickers
- Direction column uses Growth vocabulary, not Swing vocabulary
- `[Research Only]` chip visible on every row

**Implementation note:**
After this phase, audit Phase 1 components for duplication. If `SwingDecisionTabs` and `GrowthDecisionTabs` are identical except for a type parameter, extract a generic `DecisionTabs<T>` to `components/shared/`. Don't extract speculatively — wait until both exist.

---

## Phase 4: Growth Candidate Detail Panel

**Goal:** Same as Phase 2 but for Growth. Shows fundamental evidence and tax risk.

**Deliverables:**

1. `frontend/src/components/growth/GrowthCandidateDetailPanel.tsx`

2. `frontend/src/components/growth/GrowthEvidenceAccordion.tsx`
   - Renders `GrowthEvidencePacket`
   - Quality scores section: 8 sub-scores from B1 (revenue growth, earnings quality, ROIC trend, moat durability, capital allocation, management alignment, valuation discipline, balance sheet strength)
   - Each sub-score shows the bracket from the calibration rules (e.g., "ROIC 18.4% → score 0.75 (15–19.9% bracket)")
   - Hard rejection flags shown prominently (revenue decline, no FCF path, fraud, insider selling)
   - Valuation exception flag (`pre_profit_growth`) when applicable

3. `frontend/src/components/growth/GrowthTaxRiskAccordion.tsx`
   - Renders `GrowthTaxRiskPacket`
   - 4 sub-scores: after-tax downside, asset location fit, dividend tax efficiency, exit flexibility
   - `key_question_answer` rendered as a prominent chip:
     - `tax_does_not_threaten_return` → green
     - `tax_threatens_return` → yellow
     - `tax_destroys_return` → red
   - Tax complexity flags
   - `professional_review_required: true` shown as a banner inside the accordion
   - Assumptions list (the user-provided rates/lots that drove the calculation)

4. `frontend/src/components/growth/GrowthScoreTrendCard.tsx`
   - Specific to Growth because runs are weekly
   - Shows last 4 weekly scores and trend direction
   - Annotates the chart with earnings-release dates if available
   - When `score_trend: deteriorating` for 3+ runs, shows an explicit warning

5. `frontend/src/components/growth/GrowthMutationHistory.tsx`
   - Same pattern as Swing but with Growth mutation vocabulary (`valuation_stress_test`, `competitive_deep_dive`, `management_review`, `balance_sheet_stress`, `asset_location_compare`, `dividend_efficiency_check`)

**Acceptance:**
- Each B1 sub-score row shows raw metric, bracket assignment, and final 0.0–1.0 value
- The `key_question_answer` chip is the most visually prominent element of the tax risk panel
- Score trend chart shows weekly cadence (weeks on X-axis, not iterations)
- `professional_review_required` is impossible to miss

---

## Phase 5: Run Trigger UI

**Goal:** Let users start a new run from the frontend without dropping to a CLI. Both pages get a "New Run" button that opens a parameter form.

**Deliverables:**

1. `frontend/src/components/shared/RunTriggerButton.tsx`
   - Renders the button and opens a modal
   - Defaults to `dry_run: true` — explicit toggle required to set `dry_run: false`

2. `frontend/src/components/swing/SwingRunForm.tsx`
   - Fields: `mode` (premarket/intraday/postmarket/manual), `universe`, `symbols` (optional), `max_candidates`, `max_finalists`, `force_refresh`, `dry_run`
   - Submit calls `swingClient.triggerRun()`
   - On success, shows the new `run_id` and a "View Run" button that navigates to it
   - Validation: `max_candidates <= 100`, `max_finalists <= 10`, `symbols` is comma-separated tickers if provided

3. `frontend/src/components/growth/GrowthRunForm.tsx`
   - Fields: `mode` (manual/scheduled/post_earnings/quarterly), `universe`, `symbols` (optional), `max_candidates`, `max_finalists`, `account_bucket`, `tax_profile_id`, `min_history_years`, `force_refresh`, `dry_run`
   - Same submit flow

4. Loading states:
   - Polling: after triggering, poll `/api/{system}/runs/:run_id` every 5s while `status: running`
   - Show progress: `symbols_seen`, `finalists`, current iteration count
   - Cancel button (calls a cancel endpoint, optional — only if GCP3 supports it)

5. Error handling:
   - Show structured provider errors from the GCP3 response
   - If a run fails partway, show partial results with a warning

**Acceptance:**
- Default state of the form is `dry_run: true`
- A failed run shows the failure reason, not a generic error
- After a successful trigger, the page auto-navigates to the new run within 5s of completion
- Form validation prevents nonsensical inputs

---

## Phase 6: RAG Chat Panel

**Goal:** Add the run-scoped chatbot from the pipeline doc to both pages. Researchers can ask "why was NVDA accepted?" and get cited answers.

**Deliverables:**

1. `frontend/src/components/shared/RagChatPanel.tsx`
   - Generic over `system: "swing" | "growth"`
   - Uses existing `ChatMessage.tsx` and `SourcesPanel.tsx` from [components/](../frontend/src/components/)
   - Auto-binds the current `run_id` as `run_id_filter` in the request
   - Default `include_stale: false`, `include_rejected: true`
   - Renders citations as clickable chips that scroll the evidence table to the matching row

2. Citation interaction:
   - Each citation has `chunk_id`, `source_doc_id`, `ticker`, `score`, `is_stale`, `ai_degraded`
   - Clicking a citation:
     - Opens the candidate detail panel for that ticker
     - Highlights the source packet (iteration N, A1 vs. A2 for Swing; B1 vs. B2 for Growth)

3. Compliance hardening:
   - The `compliance_violation_detected: true` flag on a response renders as a red banner replacing the normal answer
   - The `answer_grounded: false` flag renders as a yellow warning above the answer
   - `[research_only]` chip on every response

4. Chat is **not** auto-loaded:
   - Panel collapsed by default
   - User must click "Ask about this run" to expand
   - First expansion sends no request — only when the user submits a question

5. Add chat proxy routes: `frontend/pages/api/swing/runs/[run_id]/chat.ts` and `frontend/pages/api/growth/runs/[run_id]/chat.ts`

**Acceptance:**
- Chat panel is collapsed on page load (no auto-call)
- Citations link back to evidence rows
- `compliance_violation_detected` responses are visually distinct
- `answer_grounded: false` shows a warning
- Stale citations show `StaleDataBadge`

---

## Phase 7: Cross-Run History (Growth-First)

**Goal:** Surface the score trajectory across multiple runs. This matters more for Growth (weekly cadence, multi-run trend) than Swing (intra-day cadence, less interpretable across runs).

**Deliverables:**

1. `frontend/src/components/growth/GrowthHistoryView.tsx`
   - New tab on the Growth page: `History`
   - Shows a ticker search/filter
   - For a selected ticker: line chart of `growth_total_score` across all indexed runs
   - Annotated with: earnings releases, decision changes (accept→watchlist→reject), and `score_trend` deterioration warnings

2. Cross-run RAG queries:
   - Allow the chat panel to drop the `run_id_filter` when in History view
   - The pipeline doc requires a date-range guard to avoid unbounded ChromaDB scans
   - Default range: last 90 days

3. `frontend/src/components/swing/SwingHistoryView.tsx` (lighter version)
   - Same shape but limited to last 30 days
   - Useful for spotting "this ticker keeps getting rejected for the same reason" patterns

**Acceptance:**
- History view loads in under 2s for a ticker with 12 weekly runs
- Date range guard is enforced server-side, not just client-side
- Chart shows decision changes, not just score values

**Implementation note:**
This phase depends on the ChromaDB ingest pipeline being live in GCP3 / the RAG service. If that work hasn't shipped, build a Firestore-backed fallback that queries `final_growth_decisions` directly. ChromaDB only matters once cross-run RAG queries are part of the chat panel.

---

## Phase 8: Polish and Performance

**Goal:** Fix what's awkward after real use. Don't optimize speculatively — wait until Phases 1–7 expose actual pain points.

**Likely deliverables:**

1. Virtualization for evidence tables that exceed 100 rows
2. Background polling for in-progress runs without freezing the UI
3. Keyboard shortcuts for tab switching, candidate navigation, and chat focus
4. Persistent run filters (remember "show only accepted" across page navigations)
5. Export buttons: CSV download for the candidate table, JSON download for a single decision
6. Empty states for: no runs yet, run failed completely, all candidates rejected
7. Mobile/narrow-viewport layout — collapse detail panel into a bottom sheet

**Acceptance:**
- No phase-7 perf issues block normal use
- Empty states are helpful, not generic
- The page works on a 1024px-wide viewport

---

## Component Inventory at the End

```text
frontend/src/
├── pages/
│   ├── SwingPage.tsx                    [Phase 1]
│   └── GrowthPage.tsx                   [Phase 3]
├── components/
│   ├── ChatMessage.tsx                  [existing]
│   ├── SourcesPanel.tsx                 [existing]
│   ├── shared/
│   │   ├── ResearchOnlyBanner.tsx       [Phase 0]
│   │   ├── ComplianceLabel.tsx          [Phase 0]
│   │   ├── StaleDataBadge.tsx           [Phase 0]
│   │   ├── AiDegradedBadge.tsx          [Phase 0]
│   │   ├── SourceFreshness.tsx          [Phase 0]
│   │   ├── ScoreTrajectory.tsx          [Phase 2]
│   │   ├── RunTriggerButton.tsx         [Phase 5]
│   │   ├── RagChatPanel.tsx             [Phase 6]
│   │   └── DecisionTabs.tsx             [Phase 3 refactor, optional]
│   ├── swing/
│   │   ├── SwingRunSummary.tsx          [Phase 1]
│   │   ├── SwingDecisionTabs.tsx        [Phase 1]
│   │   ├── SwingCandidateTable.tsx      [Phase 1]
│   │   ├── SwingCandidateDetailPanel.tsx [Phase 2]
│   │   ├── SwingEvidenceAccordion.tsx   [Phase 2]
│   │   ├── SwingCritiqueAccordion.tsx   [Phase 2]
│   │   ├── SwingMutationHistory.tsx     [Phase 2]
│   │   ├── SwingRunForm.tsx             [Phase 5]
│   │   └── SwingHistoryView.tsx         [Phase 7]
│   └── growth/
│       ├── GrowthRunSummary.tsx         [Phase 3]
│       ├── GrowthDecisionTabs.tsx       [Phase 3]
│       ├── GrowthCandidateTable.tsx     [Phase 3]
│       ├── GrowthCandidateDetailPanel.tsx [Phase 4]
│       ├── GrowthEvidenceAccordion.tsx  [Phase 4]
│       ├── GrowthTaxRiskAccordion.tsx   [Phase 4]
│       ├── GrowthScoreTrendCard.tsx     [Phase 4]
│       ├── GrowthMutationHistory.tsx    [Phase 4]
│       ├── GrowthRunForm.tsx            [Phase 5]
│       └── GrowthHistoryView.tsx        [Phase 7]
├── lib/
│   └── api/
│       ├── swingClient.ts               [Phase 0]
│       └── growthClient.ts              [Phase 0]
└── types/
    ├── swing.ts                         [Phase 0]
    ├── growth.ts                        [Phase 0]
    └── shared.ts                        [Phase 0]

frontend/pages/api/
├── swing/
│   ├── runs.ts                          [Phase 1]
│   └── runs/
│       ├── [run_id].ts                  [Phase 1]
│       └── [run_id]/chat.ts             [Phase 6]
└── growth/
    ├── runs.ts                          [Phase 3]
    └── runs/
        ├── [run_id].ts                  [Phase 3]
        └── [run_id]/chat.ts             [Phase 6]
```

---

## Phase Dependencies

```text
Phase 0 (types + shared) ─┬─→ Phase 1 (Swing skeleton) ──→ Phase 2 (Swing detail) ─┐
                          │                                                          │
                          └─→ Phase 3 (Growth skeleton) ──→ Phase 4 (Growth detail) ─┤
                                                                                     │
                                            Phase 5 (run trigger) ←──────────────────┤
                                                                                     │
                                            Phase 6 (RAG chat) ←────────────────────┤
                                                                                     │
                                            Phase 7 (cross-run) ←───────────────────┤
                                                                                     │
                                            Phase 8 (polish) ←──────────────────────┘
```

Phases 1 and 3 can run in parallel after Phase 0 if two developers are available. Phase 2 must follow Phase 1; Phase 4 must follow Phase 3. Phase 5 and Phase 6 require both pages to exist (Phases 1–4 complete).

---

## Validation at Each Phase

Every phase should answer:

1. Does `npm run typecheck` pass?
2. Does `npm run build` produce a clean bundle?
3. Does the page render against committed JSON fixtures without a live GCP3?
4. Are `[Research Only]` labels visible everywhere a ticker, score, or decision appears?
5. Are stale-data and ai-degraded states surfaced, never hidden?

These five checks are the per-phase gate. Don't move to the next phase until they pass.

---

## Out of Scope (Across All Phases)

- Order placement, broker integration, trade tickets — banned by design
- Real-time websocket updates of in-progress runs — polling is sufficient
- Multi-user authentication — assume single-trader local use unless specified
- Mobile-native app — desktop/tablet web only
- Offline mode — requires live GCP3 backend
- Editing past decisions — runs are append-only audit records

---

## Open Questions

These should be resolved before Phase 0 starts but are not blockers if deferred:

1. **Chart library:** Does the repo already use recharts, victory, visx, or another? Check before Phase 2 to avoid adding a new dep.
2. **Routing approach:** Current app uses a state-based router in `App.tsx`. Two new pages add weight to that pattern. Does the team want to introduce a real router (React Router, Next.js routing) before adding more pages? If yes, it belongs in Phase 0.
3. **API layer location:** The current frontend may not have `/pages/api/` routes yet (depends on whether it's a Vite or Next.js setup). If it's Vite, the proxy routes need a different mechanism — likely a `vite.config.ts` proxy block plus a separate Express layer, or moving to Next.js.
4. **Auth/headers:** How does the frontend authenticate to GCP3? Is there a session token, an API key in env, or open access on localhost? This affects every proxy route.

Resolve these in conversation with the user, not by guessing during implementation.
