import { useCallback, useEffect, useMemo, useState } from "react";
import * as growthClient from "../lib/api/growthClient";
import type { DecisionFilter } from "../components/shared/DecisionTabs";
import type { FinalGrowthDecision, GrowthRun, GrowthRunRequest } from "../types/growth";
import type { RagResponse } from "../types/shared";
import GrowthCandidateDetailPanel from "../components/growth/GrowthCandidateDetailPanel";
import GrowthCandidateTable from "../components/growth/GrowthCandidateTable";
import GrowthDecisionTabs from "../components/growth/GrowthDecisionTabs";
import GrowthRunForm from "../components/growth/GrowthRunForm";
import GrowthRunSummary from "../components/growth/GrowthRunSummary";
import RagChatPanel from "../components/shared/RagChatPanel";
import ResearchOnlyBanner from "../components/shared/ResearchOnlyBanner";
import RunTriggerButton from "../components/shared/RunTriggerButton";

type LoadStatus = "idle" | "loading" | "success" | "error";

function countsFor(candidates: FinalGrowthDecision[]) {
  return {
    all: candidates.length,
    accept: candidates.filter((candidate) => candidate.decision === "accept").length,
    watchlist: candidates.filter((candidate) => candidate.decision === "watchlist").length,
    reject: candidates.filter((candidate) => candidate.decision === "reject").length,
    needs_review: candidates.filter((candidate) => candidate.decision === "needs_review").length,
  };
}

export default function GrowthPage() {
  const [run, setRun] = useState<GrowthRun | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [researchOnlyHeader, setResearchOnlyHeader] = useState(false);
  const [activeDecision, setActiveDecision] = useState<DecisionFilter>("all");
  const [selected, setSelected] = useState<FinalGrowthDecision | null>(null);

  const loadLatest = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const result = await growthClient.fetchLatestRun();
      setRun(result.data);
      setResearchOnlyHeader(result.researchOnlyHeader);
      setSelected(null);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Growth run.");
      setStatus("error");
    }
  }, []);

  const loadRun = useCallback(async (runId: string) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await growthClient.fetchRun(runId);
      setRun(result.data);
      setResearchOnlyHeader(result.researchOnlyHeader);
      setSelected(null);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Growth run.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const counts = useMemo(() => countsFor(run?.candidates ?? []), [run]);
  const filteredCandidates = useMemo(() => {
    const candidates = run?.candidates ?? [];
    if (activeDecision === "all") return candidates;
    return candidates.filter((candidate) => candidate.decision === activeDecision);
  }, [activeDecision, run]);

  const startRun = async (params: GrowthRunRequest) => {
    const result = await growthClient.triggerRun(params);
    setResearchOnlyHeader(result.researchOnlyHeader);
    await loadRun(result.data.run_id);
    return result.data.run_id;
  };

  const askRun = async (message: string): Promise<RagResponse> => {
    if (!run) throw new Error("No run loaded.");
    const result = await growthClient.chat(run.run_id, message);
    setResearchOnlyHeader(result.researchOnlyHeader);
    return result.data;
  };

  const selectTicker = (ticker: string) => {
    const candidate = run?.candidates.find((item) => item.ticker === ticker);
    if (candidate) setSelected(candidate);
  };

  return (
    <main className="agent-page growth-page">
      <header className="agent-page-header">
        <div>
          <div className="eyebrow compact">System 2</div>
          <h1>Growth Ideas</h1>
          <p>2 month to 10 year research with B1 quality and B2 risk-aware tax.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-action compact" type="button" onClick={loadLatest} disabled={status === "loading"}>
            Refresh
          </button>
          <RunTriggerButton label="New Run" title="New Growth Run">
            {() => <GrowthRunForm onSubmit={startRun} />}
          </RunTriggerButton>
        </div>
      </header>

      <ResearchOnlyBanner headerPresent={researchOnlyHeader} />

      {status === "loading" && !run && (
        <div className="loading-state"><div className="spinner" /><span>Loading Growth run</span></div>
      )}

      {status === "error" && (
        <div className="error-card">
          <div className="error-title">Growth run unavailable</div>
          <div className="error-detail">{error}</div>
          <button className="retry-btn" type="button" onClick={loadLatest}>Retry</button>
        </div>
      )}

      {run && (
        <div className="agent-layout">
          <section className="agent-main">
            <div className="run-toolbar">
              <label>
                Run
                <select value={run.run_id} onChange={(event) => loadRun(event.target.value)}>
                  <option value={run.run_id}>{run.run_id}</option>
                </select>
              </label>
            </div>
            <GrowthRunSummary summary={run} />
            <GrowthDecisionTabs active={activeDecision} counts={counts} onChange={setActiveDecision} />
            <GrowthCandidateTable candidates={filteredCandidates} onSelect={setSelected} />
            <RagChatPanel
              system="growth"
              runId={run.run_id}
              onAsk={askRun}
              onCitationClick={(ticker) => selectTicker(ticker)}
            />
          </section>
          {selected && (
            <GrowthCandidateDetailPanel candidate={selected} run={run} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </main>
  );
}
