import { compactDate } from "../../lib/format";
import type { GrowthRunSummary as Summary } from "../../types/growth";

interface Props {
  summary: Summary;
}

export default function GrowthRunSummary({ summary }: Props) {
  const overBudget =
    summary.duration_seconds > summary.max_duration_seconds || summary.provider_cost_estimate_usd > 20;

  return (
    <section className="run-summary">
      <div>
        <span className="summary-label">Run</span>
        <strong>{summary.run_id}</strong>
      </div>
      <div>
        <span className="summary-label">Mode</span>
        <strong>{summary.mode}</strong>
      </div>
      <div>
        <span className="summary-label">Status</span>
        <strong>{summary.status}</strong>
      </div>
      <div>
        <span className="summary-label">Window</span>
        <strong>{compactDate(summary.started_at)} - {compactDate(summary.completed_at)}</strong>
      </div>
      <div>
        <span className="summary-label">Decisions</span>
        <strong>
          {summary.counts.accepted} / {summary.counts.watchlist} / {summary.counts.rejected} / {summary.counts.needs_review}
        </strong>
      </div>
      <div className={overBudget ? "summary-alert" : ""}>
        <span className="summary-label">Budget</span>
        <strong>
          {summary.llm_calls_used} LLM · {summary.financial_statement_calls_used} statements · ${summary.provider_cost_estimate_usd.toFixed(2)}
        </strong>
      </div>
    </section>
  );
}
