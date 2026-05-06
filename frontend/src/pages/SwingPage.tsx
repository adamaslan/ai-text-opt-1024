import { useCallback, useEffect, useMemo, useState } from "react";
import * as swingClient from "../lib/api/swingClient";
import type { DecisionFilter } from "../components/shared/DecisionTabs";
import type { RagResponse } from "../types/shared";
import type { FinalSwingDecision, SwingRun, SwingRunRequest } from "../types/swing";
import ResearchOnlyBanner from "../components/shared/ResearchOnlyBanner";
import RagChatPanel from "../components/shared/RagChatPanel";
import RunTriggerButton from "../components/shared/RunTriggerButton";
import SwingCandidateDetailPanel from "../components/swing/SwingCandidateDetailPanel";
import SwingCandidateTable from "../components/swing/SwingCandidateTable";
import SwingDecisionTabs from "../components/swing/SwingDecisionTabs";
import SwingRunForm from "../components/swing/SwingRunForm";
import SwingRunSummary from "../components/swing/SwingRunSummary";

type LoadStatus = "idle" | "loading" | "success" | "error";

function countsFor(candidates: FinalSwingDecision[]) {
  return {
    all: candidates.length,
    accept: candidates.filter((candidate) => candidate.decision === "accept").length,
    watchlist: candidates.filter((candidate) => candidate.decision === "watchlist").length,
    reject: candidates.filter((candidate) => candidate.decision === "reject").length,
    needs_review: candidates.filter((candidate) => candidate.decision === "needs_review").length,
  };
}

export default function SwingPage() {
  const [run, setRun] = useState<SwingRun | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [researchOnlyHeader, setResearchOnlyHeader] = useState(false);
  const [activeDecision, setActiveDecision] = useState<DecisionFilter>("all");
  const [selected, setSelected] = useState<FinalSwingDecision | null>(null);

  const loadLatest = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const result = await swingClient.fetchLatestRun();
      setRun(result.data);
      setResearchOnlyHeader(result.researchOnlyHeader);
      setSelected(null);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Swing run.");
      setStatus("error");
    }
  }, []);

  const loadRun = useCallback(async (runId: string) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await swingClient.fetchRun(runId);
      setRun(result.data);
      setResearchOnlyHeader(result.researchOnlyHeader);
      setSelected(null);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Swing run.");
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

  const startRun = async (params: SwingRunRequest) => {
    const result = await swingClient.triggerRun(params);
    setResearchOnlyHeader(result.researchOnlyHeader);
    await loadRun(result.data.run_id);
    return result.data.run_id;
  };

  const askRun = async (message: string): Promise<RagResponse> => {
    if (!run) throw new Error("No run loaded.");
    const result = await swingClient.chat(run.run_id, message);
    setResearchOnlyHeader(result.researchOnlyHeader);
    return result.data;
  };

  const selectTicker = (ticker: string) => {
    const candidate = run?.candidates.find((item) => item.ticker === ticker);
    if (candidate) setSelected(candidate);
  };

  return (
    <main className="agent-page swing-page">
      <header className="agent-page-header">
        <div>
          <div className="eyebrow compact">System 1</div>
          <h1>Swing Ideas</h1>
          <p>0-2 month technical research with A1 discovery and A2 critique.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-action compact" type="button" onClick={loadLatest} disabled={status === "loading"}>
            Refresh
          </button>
          <RunTriggerButton label="New Run" title="New Swing Run">
            {() => <SwingRunForm onSubmit={startRun} />}
          </RunTriggerButton>
        </div>
      </header>

      <ResearchOnlyBanner headerPresent={researchOnlyHeader} />

      {status === "loading" && !run && (
        <div className="loading-state"><div className="spinner" /><span>Loading Swing run</span></div>
      )}

      {status === "error" && (
        <div className="error-card">
          <div className="error-title">Swing run unavailable</div>
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
            <SwingRunSummary summary={run} />
            <SwingDecisionTabs active={activeDecision} counts={counts} onChange={setActiveDecision} />
            <SwingCandidateTable candidates={filteredCandidates} onSelect={setSelected} />
            <RagChatPanel
              system="swing"
              runId={run.run_id}
              onAsk={askRun}
              onCitationClick={(ticker) => selectTicker(ticker)}
            />
          </section>
          {selected && (
            <SwingCandidateDetailPanel candidate={selected} run={run} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </main>
  );
}
