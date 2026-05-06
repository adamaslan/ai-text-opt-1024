import type { GrowthRun, GrowthRunRequest } from "../../types/growth";
import type { ApiResult, RagResponse, TriggerRunResponse } from "../../types/shared";
import { requestJson } from "./http";

export function fetchLatestRun(): Promise<ApiResult<GrowthRun>> {
  return requestJson<GrowthRun>("/api/growth/runs");
}

export function fetchRun(runId: string): Promise<ApiResult<GrowthRun>> {
  return requestJson<GrowthRun>(`/api/growth/runs/${encodeURIComponent(runId)}`);
}

export function triggerRun(params: GrowthRunRequest): Promise<ApiResult<TriggerRunResponse>> {
  return requestJson<TriggerRunResponse>("/api/growth/runs", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function chat(runId: string, message: string): Promise<ApiResult<RagResponse>> {
  return requestJson<RagResponse>(`/api/growth/runs/${encodeURIComponent(runId)}/chat`, {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: `growth-${runId}`,
      context: {
        system_filter: "growth",
        ticker_filter: [],
        run_id_filter: runId,
        decision_filter: null,
        max_chunks: 8,
        include_stale: false,
        include_rejected: true,
      },
    }),
  });
}
