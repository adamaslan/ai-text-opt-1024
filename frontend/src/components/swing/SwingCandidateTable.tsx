import { useMemo, useState } from "react";
import { decisionClass, scorePct, titleCase } from "../../lib/format";
import type { FinalSwingDecision } from "../../types/swing";
import ComplianceLabel from "../shared/ComplianceLabel";
import SourceFreshness from "../shared/SourceFreshness";
import AiDegradedBadge from "../shared/AiDegradedBadge";

interface Props {
  candidates: FinalSwingDecision[];
  onSelect: (candidate: FinalSwingDecision) => void;
}

type SortKey = "ticker" | "score" | "decision" | "iterations";

export default function SwingCandidateTable({ candidates, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [descending, setDescending] = useState(true);

  const rows = useMemo(() => {
    const sorted = [...candidates].sort((a, b) => {
      const multiplier = descending ? -1 : 1;
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * multiplier;
      if (sortKey === "decision") return a.decision.localeCompare(b.decision) * multiplier;
      if (sortKey === "iterations") return (a.iterations_used - b.iterations_used) * multiplier;
      return (a.swing_total_score - b.swing_total_score) * multiplier;
    });
    return sorted;
  }, [candidates, descending, sortKey]);

  const updateSort = (next: SortKey) => {
    if (next === sortKey) {
      setDescending((value) => !value);
      return;
    }
    setSortKey(next);
    setDescending(next === "score");
  };

  return (
    <div className="candidate-table-wrap">
      <table className="agent-table">
        <thead>
          <tr>
            <th><button type="button" onClick={() => updateSort("ticker")}>Ticker</button></th>
            <th>Direction</th>
            <th>Horizon</th>
            <th><button type="button" onClick={() => updateSort("score")}>Score</button></th>
            <th>A1</th>
            <th>A2</th>
            <th><button type="button" onClick={() => updateSort("iterations")}>Iterations</button></th>
            <th>Freshness</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((candidate) => {
            const evidence = candidate.latest_evidence;
            const critique = candidate.latest_critique;
            return (
              <tr key={candidate.ticker} onClick={() => onSelect(candidate)}>
                <td>
                  <div className="ticker-cell">
                    <strong>{candidate.ticker}</strong>
                    <span className={`decision-chip ${decisionClass(candidate.decision)}`}>{titleCase(candidate.decision)}</span>
                    <ComplianceLabel />
                  </div>
                </td>
                <td>{candidate.direction ?? evidence?.direction ?? "-"}</td>
                <td>{candidate.horizon ?? evidence?.horizon ?? "-"}</td>
                <td>
                  <div className="score-cell">
                    <span>{scorePct(candidate.swing_total_score)}</span>
                    <div className="mini-score"><i style={{ width: scorePct(candidate.swing_total_score) }} /></div>
                  </div>
                </td>
                <td>{evidence ? scorePct(evidence.swing_discovery_score) : "-"}</td>
                <td>{critique ? scorePct(critique.swing_critic_score) : "-"}</td>
                <td>{candidate.iterations_used}</td>
                <td>
                  <SourceFreshness
                    computedAt={evidence?.computed_at}
                    sourceFreshness={evidence?.source_freshness}
                    isStale={candidate.is_stale ?? evidence?.is_stale}
                  />
                  <AiDegradedBadge aiDegraded={candidate.ai_degraded ?? evidence?.ai_degraded} />
                </td>
                <td>
                  <button className="secondary-action compact" type="button" onClick={(event) => { event.stopPropagation(); onSelect(candidate); }}>
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="table-empty">No candidates in this decision set.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
