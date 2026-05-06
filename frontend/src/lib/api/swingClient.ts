import type { ApiResult, RagResponse, TriggerRunResponse } from "../../types/shared";
import type { SwingRun, SwingRunRequest } from "../../types/swing";
import { requestJson } from "./http";

export function fetchLatestRun(): Promise<ApiResult<SwingRun>> {
  return requestJson<SwingRun>("/api/swing/runs");
}

export function fetchRun(runId: string): Promise<ApiResult<SwingRun>> {
  return requestJson<SwingRun>(`/api/swing/runs/${encodeURIComponent(runId)}`);
}

export function triggerRun(params: SwingRunRequest): Promise<ApiResult<TriggerRunResponse>> {
  return requestJson<TriggerRunResponse>("/api/swing/runs", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function chat(runId: string, message: string): Promise<ApiResult<RagResponse>> {
  return requestJson<RagResponse>(`/api/swing/runs/${encodeURIComponent(runId)}/chat`, {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: `swing-${runId}`,
      context: {
        system_filter: "swing",
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
