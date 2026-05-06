import type {
  ComplianceLabel,
  Decision,
  MutationRecord,
  ProviderAttempt,
  RunCounts,
  RunThresholds,
} from "./shared";

export type GrowthDirection = "accumulate" | "hold" | "trim" | "avoid";
export type GrowthHorizon = "2m-6m" | "6m-2y" | "2y-5y" | "5y-10y" | "10y-plus";
export type GrowthMode = "manual" | "scheduled" | "post_earnings" | "quarterly";
export type ScoreTrend = "improving" | "stable" | "deteriorating" | "insufficient_history";
export type KeyQuestionAnswer =
  | "tax_does_not_threaten_return"
  | "tax_threatens_return"
  | "tax_destroys_return";

export interface GrowthQualityScores {
  revenue_growth: number;
  earnings_quality: number;
  roic_trend: number;
  moat_durability: number;
  capital_allocation: number;
  management_alignment: number;
  valuation_discipline: number;
  balance_sheet_strength: number;
}

export interface QualityScoreDetail {
  metric: string;
  bracket: string;
  score: number;
}

export interface GrowthEvidencePacket {
  ticker: string;
  direction: GrowthDirection;
  horizon: GrowthHorizon;
  quality_scores: GrowthQualityScores;
  growth_quality_score: number;
  hard_rejection_flags: string[];
  supporting_evidence: string[];
  counter_evidence: string[];
  source_freshness: Record<string, string>;
  deterministic_summary: string;
  llm_summary: string | null;
  ai_degraded: boolean;
  quality_score_details?: Partial<Record<keyof GrowthQualityScores, QualityScoreDetail>>;
  valuation_exception?: "pre_profit_growth" | null;
  computed_at?: string;
  is_stale?: boolean;
}

export interface GrowthTaxRiskPacket {
  ticker: string;
  after_tax_downside_score: number;
  asset_location_fit_score: number;
  dividend_tax_efficiency_score: number;
  exit_flexibility_score: number;
  growth_tax_risk_score: number;
  key_question_answer: KeyQuestionAnswer;
  tax_complexity_flags: string[];
  professional_review_required: boolean;
  assumptions: string[];
  computed_at?: string;
}

export interface ScoreTrajectory {
  ticker: string;
  score_trend: ScoreTrend;
  trend_window_runs: number;
  prior_scores: number[];
  trend_direction: ScoreTrend;
  run_dates?: string[];
  earnings_dates?: string[];
}

export interface FinalGrowthDecision {
  run_id: string;
  ticker: string;
  growth_total_score: number;
  decision: Decision;
  decision_reason: string;
  iterations_used: number;
  mutation_history: MutationRecord[];
  compliance_label: ComplianceLabel;
  score_trajectory: ScoreTrajectory;
  direction?: GrowthDirection;
  horizon?: GrowthHorizon;
  latest_evidence?: GrowthEvidencePacket;
  latest_tax_risk?: GrowthTaxRiskPacket;
  is_stale?: boolean;
  ai_degraded?: boolean;
}

export interface GrowthIteration {
  iteration: number;
  ticker: string;
  growth_total_score: number;
  evidence_packet: GrowthEvidencePacket;
  tax_risk_packet: GrowthTaxRiskPacket;
  mutation_applied?: MutationRecord | null;
  computed_at?: string;
}

export interface GrowthRunSummary {
  run_id: string;
  system: "growth";
  mode: GrowthMode;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  started_at: string;
  completed_at: string | null;
  counts: RunCounts;
  llm_calls_used: number;
  financial_statement_calls_used: number;
  provider_cost_estimate_usd: number;
  max_duration_seconds: number;
  duration_seconds: number;
  thresholds: RunThresholds;
  research_only: true;
}

export interface GrowthRun extends GrowthRunSummary {
  universe: string;
  max_candidates: number;
  max_finalists: number;
  candidates: FinalGrowthDecision[];
  iterations: GrowthIteration[];
  provider_attempts?: ProviderAttempt[];
  symbols_seen?: number;
  finalists?: number;
}

export interface GrowthRunRequest {
  mode: GrowthMode;
  universe: "quality_screener" | "watchlist" | "merged" | "custom";
  symbols: string[];
  max_candidates: number;
  max_finalists: number;
  account_bucket: "taxable" | "traditional_retirement" | "roth" | "hsa" | "paper";
  tax_profile_id: string;
  min_history_years: number;
  include_llm: boolean;
  force_refresh: boolean;
  dry_run: boolean;
}
