import type {
  ComplianceLabel,
  Decision,
  MutationRecord,
  ProviderAttempt,
  RunCounts,
  RunThresholds,
  ToolResult,
} from "./shared";

export type SwingDirection = "long" | "short" | "neutral" | "avoid";
export type SwingHorizon = "intraday" | "2d-5d" | "1w-3w" | "1m-2m";
export type SwingMode = "premarket" | "intraday" | "postmarket" | "manual";
export type SwingVerdict = "pass" | "watch" | "mutate" | "reject" | "needs_review";

export interface SwingFeatureScores {
  trend: number;
  momentum: number;
  volume: number;
  volatility_quality: number;
  sector_relative: number;
  multi_timeframe_agreement: number;
  april500: number;
}

export interface April500SignalBreakdown {
  bollinger?: number;
  rsi?: number;
  macd?: number;
  ichimoku?: number;
  volume_flow?: number;
}

export interface April500Details {
  net_score: number;
  signals: April500SignalBreakdown;
  bar_confluence?: number;
  support_resistance?: string;
  multi_timeframe_outlook?: string;
}

export interface SwingEvidencePacket {
  ticker: string;
  direction: SwingDirection;
  horizon: SwingHorizon;
  timeframes_checked: string[];
  feature_scores: SwingFeatureScores;
  swing_discovery_score: number;
  supporting_evidence: string[];
  counter_evidence: string[];
  risk_flags: string[];
  source_freshness: Record<string, string>;
  deterministic_summary: string;
  llm_summary: string | null;
  ai_degraded: boolean;
  april500_details?: April500Details;
  computed_at?: string;
  is_stale?: boolean;
  tool_results?: ToolResult[];
}

export interface SwingCritiquePacket {
  ticker: string;
  stop_geometry: {
    entry_zone: string | null;
    invalidation_level: number | null;
    atr_distance: number | null;
    risk_reward_estimate: number | null;
  };
  event_risk: {
    earnings_within_48h: boolean;
    fomc_within_48h: boolean;
    sector_events: string[];
  };
  liquidity_check: "pass" | "warn" | "fail";
  correlation_to_accepted: number;
  critic_findings: string[];
  risk_penalties: string[];
  swing_critic_score: number;
  verdict: SwingVerdict;
  ai_degraded?: boolean;
  computed_at?: string;
}

export interface FinalSwingDecision {
  run_id: string;
  ticker: string;
  swing_total_score: number;
  decision: Decision;
  decision_reason: string;
  iterations_used: number;
  mutation_history: MutationRecord[];
  compliance_label: ComplianceLabel;
  direction?: SwingDirection;
  horizon?: SwingHorizon;
  latest_evidence?: SwingEvidencePacket;
  latest_critique?: SwingCritiquePacket;
  is_stale?: boolean;
  ai_degraded?: boolean;
}

export interface SwingIteration {
  iteration: number;
  ticker: string;
  swing_total_score: number;
  evidence_packet: SwingEvidencePacket;
  critique_packet: SwingCritiquePacket;
  mutation_applied?: MutationRecord | null;
  computed_at?: string;
}

export interface SwingRunSummary {
  run_id: string;
  system: "swing";
  mode: SwingMode;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  started_at: string;
  completed_at: string | null;
  counts: RunCounts;
  llm_calls_used: number;
  april500_calls_used: number;
  provider_cost_estimate_usd: number;
  max_duration_seconds: number;
  duration_seconds: number;
  thresholds: RunThresholds;
  research_only: true;
}

export interface SwingRun extends SwingRunSummary {
  universe: string;
  max_candidates: number;
  max_finalists: number;
  candidates: FinalSwingDecision[];
  iterations: SwingIteration[];
  provider_attempts?: ProviderAttempt[];
  symbols_seen?: number;
  finalists?: number;
}

export interface SwingRunRequest {
  mode: SwingMode;
  universe: "screener" | "watchlist" | "merged" | "custom";
  symbols: string[];
  max_candidates: number;
  max_finalists: number;
  include_llm: boolean;
  force_refresh: boolean;
  dry_run: boolean;
}
