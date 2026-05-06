import { decisionLabel } from "../../lib/format";
import type { Decision } from "../../types/shared";

export type DecisionFilter = Decision | "all";

interface Props {
  active: DecisionFilter;
  counts: Record<DecisionFilter, number>;
  onChange: (decision: DecisionFilter) => void;
}

const tabs: DecisionFilter[] = ["all", "accept", "watchlist", "reject", "needs_review"];

export default function DecisionTabs({ active, counts, onChange }: Props) {
  return (
    <div className="agent-tabs" role="tablist" aria-label="Decision filters">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`agent-tab ${active === tab ? "active" : ""}`}
          onClick={() => onChange(tab)}
          type="button"
        >
          <span>{decisionLabel(tab)}</span>
          <strong>{counts[tab] ?? 0}</strong>
        </button>
      ))}
    </div>
  );
}
