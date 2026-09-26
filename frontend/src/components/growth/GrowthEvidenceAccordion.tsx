import { scorePct, titleCase } from "../../lib/format";
import type { GrowthEvidencePacket, GrowthQualityScores } from "../../types/growth";
import AiDegradedBadge from "../shared/AiDegradedBadge";
import SourceFreshness from "../shared/SourceFreshness";

interface Props {
  packets: GrowthEvidencePacket[];
}

const scoreKeys: Array<keyof GrowthQualityScores> = [
  "revenue_growth",
  "earnings_quality",
  "roic_trend",
  "moat_durability",
  "capital_allocation",
  "management_alignment",
  "valuation_discipline",
  "balance_sheet_strength",
];

export default function GrowthEvidenceAccordion({ packets }: Props) {
  return (
    <details className="detail-section" open>
      <summary>B1 Quality</summary>
      <div className="detail-stack">
        {packets.map((packet, index) => (
          <section className="evidence-block" key={`${packet.ticker}-quality-${index}`}>
            <div className="block-heading">
              <strong>Iteration {index + 1}</strong>
              <SourceFreshness computedAt={packet.computed_at} sourceFreshness={packet.source_freshness} isStale={packet.is_stale} />
              <AiDegradedBadge aiDegraded={packet.ai_degraded} />
            </div>
            <div className="score-grid quality">
              {scoreKeys.map((key) => {
                const detail = packet.quality_score_details?.[key];
                return (
                  <div key={key} className="score-row">
                    <span>{titleCase(key)}</span>
                    <div><i style={{ width: scorePct(packet.quality_scores[key]) }} /></div>
                    <strong>{scorePct(packet.quality_scores[key])}</strong>
                    <small>{detail ? `${detail.metric} -> ${detail.bracket}` : "calibrated"}</small>
                  </div>
                );
              })}
            </div>
            {packet.valuation_exception && (
              <div className="inline-warning">Valuation exception: {titleCase(packet.valuation_exception)}</div>
            )}
            {packet.hard_rejection_flags.length > 0 && (
              <div className="risk-list hard">
                {packet.hard_rejection_flags.map((flag) => <span key={flag}>{flag}</span>)}
              </div>
            )}
            <p className="detail-copy">{packet.deterministic_summary}</p>
            {packet.llm_summary && <p className="detail-copy muted">{packet.llm_summary}</p>}
            <div className="two-col-lists">
              <div>
                <h4>Supporting</h4>
                <ul>{packet.supporting_evidence.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div>
                <h4>Counter</h4>
                <ul>{packet.counter_evidence.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
