import { FormEvent, useState } from "react";
import { parseSymbols } from "../../lib/format";
import type { SwingRunRequest } from "../../types/swing";

interface Props {
  onSubmit: (params: SwingRunRequest) => Promise<string>;
}

export default function SwingRunForm({ onSubmit }: Props) {
  const [mode, setMode] = useState<SwingRunRequest["mode"]>("manual");
  const [universe, setUniverse] = useState<SwingRunRequest["universe"]>("screener");
  const [symbols, setSymbols] = useState("");
  const [maxCandidates, setMaxCandidates] = useState(25);
  const [maxFinalists, setMaxFinalists] = useState(5);
  const [includeLlm, setIncludeLlm] = useState(true);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (maxCandidates > 100 || maxFinalists > 10) {
      setStatus("Candidate limits are above the configured maximum.");
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const runId = await onSubmit({
        mode,
        universe,
        symbols: parseSymbols(symbols),
        max_candidates: maxCandidates,
        max_finalists: maxFinalists,
        include_llm: includeLlm,
        force_refresh: forceRefresh,
        dry_run: dryRun,
      });
      setStatus(`Run queued: ${runId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Run trigger failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="run-form" onSubmit={submit}>
      <label>
        Mode
        <select value={mode} onChange={(event) => setMode(event.target.value as SwingRunRequest["mode"])}>
          <option value="premarket">Premarket</option>
          <option value="intraday">Intraday</option>
          <option value="postmarket">Postmarket</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      <label>
        Universe
        <select value={universe} onChange={(event) => setUniverse(event.target.value as SwingRunRequest["universe"])}>
          <option value="screener">Screener</option>
          <option value="watchlist">Watchlist</option>
          <option value="merged">Merged</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Symbols
        <input value={symbols} onChange={(event) => setSymbols(event.target.value)} placeholder="AAPL, MSFT" />
      </label>
      <div className="form-grid">
        <label>
          Max Candidates
          <input type="number" min="1" max="100" value={maxCandidates} onChange={(event) => setMaxCandidates(Number(event.target.value))} />
        </label>
        <label>
          Max Finalists
          <input type="number" min="1" max="10" value={maxFinalists} onChange={(event) => setMaxFinalists(Number(event.target.value))} />
        </label>
      </div>
      <div className="check-row">
        <label><input type="checkbox" checked={includeLlm} onChange={(event) => setIncludeLlm(event.target.checked)} /> LLM</label>
        <label><input type="checkbox" checked={forceRefresh} onChange={(event) => setForceRefresh(event.target.checked)} /> Refresh</label>
        <label><input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} /> Dry Run</label>
      </div>
      {status && <div className="form-status">{status}</div>}
      <button className="primary-action compact" type="submit" disabled={submitting}>
        {submitting ? "Starting" : "Start Run"}
      </button>
    </form>
  );
}
