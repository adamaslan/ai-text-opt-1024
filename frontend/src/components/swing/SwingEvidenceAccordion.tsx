import { scorePct, titleCase } from "../../lib/format";
import type { SwingEvidencePacket } from "../../types/swing";
import AiDegradedBadge from "../shared/AiDegradedBadge";
import SourceFreshness from "../shared/SourceFreshness";

interface Props {
  packets: SwingEvidencePacket[];
}

export default function SwingEvidenceAccordion({ packets }: Props) {
  return (
    <details className="detail-section" open>
      <summary>A1 Evidence</summary>
      <div className="detail-stack">
        {packets.map((packet, index) => (
          <section className="evidence-block" key={`${packet.ticker}-${index}`}>
            <div className="block-heading">
              <strong>Iteration {index + 1}</strong>
              <SourceFreshness
                computedAt={packet.computed_at}
                sourceFreshness={packet.source_freshness}
                isStale={packet.is_stale}
              />
              <AiDegradedBadge aiDegraded={packet.ai_degraded} />
            </div>
            <div className="score-grid">
              {Object.entries(packet.feature_scores).map(([key, value]) => (
                <div key={key} className="score-row">
                  <span>{titleCase(key)}</span>
                  <div><i style={{ width: scorePct(value) }} /></div>
                  <strong>{scorePct(value)}</strong>
                </div>
              ))}
            </div>
            <p className="detail-copy">{packet.deterministic_summary}</p>
            {packet.llm_summary && <p className="detail-copy muted">{packet.llm_summary}</p>}
            {packet.april500_details && packet.feature_scores.april500 > 0 && (
              <div className="sub-panel">
                <strong>April 500</strong>
                <div className="fact-grid">
                  <span>Net Score</span><b>{scorePct(packet.april500_details.net_score)}</b>
                  <span>Bar Confluence</span><b>{packet.april500_details.bar_confluence ? scorePct(packet.april500_details.bar_confluence) : "-"}</b>
                  <span>Support/Resistance</span><b>{packet.april500_details.support_resistance ?? "-"}</b>
                </div>
                <div className="chip-row">
                  {Object.entries(packet.april500_details.signals).map(([key, value]) => (
                    <span className="metric-chip" key={key}>{titleCase(key)} {value === undefined ? "-" : scorePct(value)}</span>
                  ))}
                </div>
              </div>
            )}
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
            {packet.risk_flags.length > 0 && (
              <div className="risk-list">
                {packet.risk_flags.map((flag) => <span key={flag}>{flag}</span>)}
              </div>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
