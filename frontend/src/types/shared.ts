export type Decision = "accept" | "watchlist" | "reject" | "needs_review";

export type ComplianceLabel = "research_only";

export type ToolStatus = "ok" | "partial" | "failed" | "stale" | "skipped";

export interface ToolResult {
  tool_name: string;
  tool_family: string;
  inputs_hash: string;
  timeframe: "1d" | "5d" | "1m" | "3m" | "6m" | "1y" | "5y" | "custom";
  status: ToolStatus;
  score_delta: number;
  evidence: string[];
  counter_evidence: string[];
  risk_flags: string[];
  source_timestamps: Record<string, string>;
  computed_at: string;
}

export interface ProviderAttempt {
  provider: "openrouter" | "mistral" | "gemini" | "rule_based" | string;
  model?: string;
  status: "success" | "failed" | "skipped";
  latency_ms?: number;
  error_code?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface RagCitation {
  chunk_id: string;
  source_doc_id: string;
  ticker: string;
  system: "swing" | "growth";
  collection: string;
  score: number;
  computed_at: string;
  is_stale: boolean;
  ai_degraded: boolean;
  snippet: string;
}

export interface RagResponse {
  answer: string;
  citations: RagCitation[];
  answer_grounded: boolean;
  compliance_label: ComplianceLabel;
  provider_used: "openrouter" | "mistral" | "gemini" | "rule_based" | string;
  ai_degraded: boolean;
  compliance_violation_detected?: boolean;
}

export interface RunThresholds {
  accept_threshold: number;
  watchlist_threshold: number;
  reject_threshold: number;
}

export interface RunCounts {
  accepted: number;
  watchlist: number;
  rejected: number;
  needs_review: number;
}

export interface MutationRecord {
  iteration: number;
  mutation_type: string;
  value: string | number | boolean | null;
  reason: string;
  terminal?: boolean;
}

export interface TriggerRunResponse {
  run_id: string;
  status: "queued" | "running" | "completed" | "failed" | "partial";
  research_only?: boolean;
}

export interface ApiResult<T> {
  data: T;
  researchOnlyHeader: boolean;
}
