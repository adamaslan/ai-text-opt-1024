import { scorePct } from "../../lib/format";
import type { FinalGrowthDecision, GrowthRun } from "../../types/growth";
import ComplianceLabel from "../shared/ComplianceLabel";
import GrowthEvidenceAccordion from "./GrowthEvidenceAccordion";
import GrowthMutationHistory from "./GrowthMutationHistory";
import GrowthScoreTrendCard from "./GrowthScoreTrendCard";
import GrowthTaxRiskAccordion from "./GrowthTaxRiskAccordion";

interface Props {
  candidate: FinalGrowthDecision;
  run: GrowthRun;
  onClose: () => void;
}

export default function GrowthCandidateDetailPanel({ candidate, run, onClose }: Props) {
  const iterations = run.iterations.filter((iteration) => iteration.ticker === candidate.ticker);
  const evidence = iterations.map((iteration) => iteration.evidence_packet);
  const taxRisk = iterations.map((iteration) => iteration.tax_risk_packet);

  return (
    <aside className="detail-panel" aria-label={`${candidate.ticker} growth detail`}>
      <div className="detail-header">
        <div>
          <div className="eyebrow compact">Growth Detail</div>
          <h2>{candidate.ticker} · {scorePct(candidate.growth_total_score)}</h2>
          <p>{candidate.decision_reason}</p>
        </div>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Close detail">x</button>
      </div>
      <div className="detail-chip-row">
        <ComplianceLabel />
        <span>{candidate.direction ?? candidate.latest_evidence?.direction}</span>
        <span>{candidate.horizon ?? candidate.latest_evidence?.horizon}</span>
      </div>
      <GrowthScoreTrendCard
        trajectory={candidate.score_trajectory}
        acceptThreshold={run.thresholds.accept_threshold}
        rejectThreshold={run.thresholds.reject_threshold}
      />
      <GrowthEvidenceAccordion packets={evidence.length ? evidence : candidate.latest_evidence ? [candidate.latest_evidence] : []} />
      <GrowthTaxRiskAccordion packets={taxRisk.length ? taxRisk : candidate.latest_tax_risk ? [candidate.latest_tax_risk] : []} />
      <GrowthMutationHistory mutations={candidate.mutation_history} />
    </aside>
  );
}
