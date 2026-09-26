import { scorePct } from "../../lib/format";
import type { FinalSwingDecision, SwingRun } from "../../types/swing";
import ComplianceLabel from "../shared/ComplianceLabel";
import ScoreTrajectory from "../shared/ScoreTrajectory";
import SwingCritiqueAccordion from "./SwingCritiqueAccordion";
import SwingEvidenceAccordion from "./SwingEvidenceAccordion";
import SwingMutationHistory from "./SwingMutationHistory";

interface Props {
  candidate: FinalSwingDecision;
  run: SwingRun;
  onClose: () => void;
}

export default function SwingCandidateDetailPanel({ candidate, run, onClose }: Props) {
  const iterations = run.iterations.filter((iteration) => iteration.ticker === candidate.ticker);
  const evidence = iterations.map((iteration) => iteration.evidence_packet);
  const critiques = iterations.map((iteration) => iteration.critique_packet);
  const points = iterations.length ? iterations.map((iteration) => ({
    label: String(iteration.iteration),
    score: iteration.swing_total_score,
    mutation: iteration.mutation_applied?.mutation_type,
  })) : [{ label: "final", score: candidate.swing_total_score, mutation: "terminal" }];

  return (
    <aside className="detail-panel" aria-label={`${candidate.ticker} swing detail`}>
      <div className="detail-header">
        <div>
          <div className="eyebrow compact">Swing Detail</div>
          <h2>{candidate.ticker} · {scorePct(candidate.swing_total_score)}</h2>
          <p>{candidate.decision_reason}</p>
        </div>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Close detail">x</button>
      </div>
      <div className="detail-chip-row">
        <ComplianceLabel />
        <span>{candidate.direction ?? candidate.latest_evidence?.direction}</span>
        <span>{candidate.horizon ?? candidate.latest_evidence?.horizon}</span>
      </div>
      <ScoreTrajectory
        points={points}
        acceptThreshold={run.thresholds.accept_threshold}
        rejectThreshold={run.thresholds.reject_threshold}
      />
      <SwingEvidenceAccordion packets={evidence.length ? evidence : candidate.latest_evidence ? [candidate.latest_evidence] : []} />
      <SwingCritiqueAccordion packets={critiques.length ? critiques : candidate.latest_critique ? [candidate.latest_critique] : []} />
      <SwingMutationHistory mutations={candidate.mutation_history} />
    </aside>
  );
}
