import { FormEvent, useState } from "react";
import { parseSymbols } from "../../lib/format";
import type { GrowthRunRequest } from "../../types/growth";

interface Props {
  onSubmit: (params: GrowthRunRequest) => Promise<string>;
}

export default function GrowthRunForm({ onSubmit }: Props) {
  const [mode, setMode] = useState<GrowthRunRequest["mode"]>("manual");
  const [universe, setUniverse] = useState<GrowthRunRequest["universe"]>("quality_screener");
  const [symbols, setSymbols] = useState("");
  const [maxCandidates, setMaxCandidates] = useState(20);
  const [maxFinalists, setMaxFinalists] = useState(5);
  const [accountBucket, setAccountBucket] = useState<GrowthRunRequest["account_bucket"]>("paper");
  const [taxProfileId, setTaxProfileId] = useState("default");
  const [minHistoryYears, setMinHistoryYears] = useState(5);
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
        account_bucket: accountBucket,
        tax_profile_id: taxProfileId,
        min_history_years: minHistoryYears,
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
        <select value={mode} onChange={(event) => setMode(event.target.value as GrowthRunRequest["mode"])}>
          <option value="manual">Manual</option>
          <option value="scheduled">Scheduled</option>
          <option value="post_earnings">Post Earnings</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </label>
      <label>
        Universe
        <select value={universe} onChange={(event) => setUniverse(event.target.value as GrowthRunRequest["universe"])}>
          <option value="quality_screener">Quality Screener</option>
          <option value="watchlist">Watchlist</option>
          <option value="merged">Merged</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Symbols
        <input value={symbols} onChange={(event) => setSymbols(event.target.value)} placeholder="MSFT, GOOGL" />
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
      <div className="form-grid">
        <label>
          Account
          <select value={accountBucket} onChange={(event) => setAccountBucket(event.target.value as GrowthRunRequest["account_bucket"])}>
            <option value="paper">Paper</option>
            <option value="taxable">Taxable</option>
            <option value="traditional_retirement">Traditional Retirement</option>
            <option value="roth">Roth</option>
            <option value="hsa">HSA</option>
          </select>
        </label>
        <label>
          History Years
          <input type="number" min="1" max="15" value={minHistoryYears} onChange={(event) => setMinHistoryYears(Number(event.target.value))} />
        </label>
      </div>
      <label>
        Tax Profile
        <input value={taxProfileId} onChange={(event) => setTaxProfileId(event.target.value)} />
      </label>
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
