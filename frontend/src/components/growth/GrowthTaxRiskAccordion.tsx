import { scorePct, titleCase } from "../../lib/format";
import type { GrowthTaxRiskPacket } from "../../types/growth";

interface Props {
  packets: GrowthTaxRiskPacket[];
}

export default function GrowthTaxRiskAccordion({ packets }: Props) {
  return (
    <details className="detail-section" open>
      <summary>B2 Tax Risk</summary>
      <div className="detail-stack">
        {packets.map((packet, index) => (
          <section className="evidence-block" key={`${packet.ticker}-tax-${index}`}>
            <div className="block-heading">
              <strong>Iteration {index + 1}</strong>
              <span className={`tax-answer ${packet.key_question_answer}`}>{titleCase(packet.key_question_answer)}</span>
            </div>
            {packet.professional_review_required && (
              <div className="inline-danger">Professional review required.</div>
            )}
            <div className="score-grid">
              <div className="score-row">
                <span>After-tax Downside</span>
                <div><i style={{ width: scorePct(packet.after_tax_downside_score) }} /></div>
                <strong>{scorePct(packet.after_tax_downside_score)}</strong>
              </div>
              <div className="score-row">
                <span>Asset Location</span>
                <div><i style={{ width: scorePct(packet.asset_location_fit_score) }} /></div>
                <strong>{scorePct(packet.asset_location_fit_score)}</strong>
              </div>
              <div className="score-row">
                <span>Dividend Efficiency</span>
                <div><i style={{ width: scorePct(packet.dividend_tax_efficiency_score) }} /></div>
                <strong>{scorePct(packet.dividend_tax_efficiency_score)}</strong>
              </div>
              <div className="score-row">
                <span>Exit Flexibility</span>
                <div><i style={{ width: scorePct(packet.exit_flexibility_score) }} /></div>
                <strong>{scorePct(packet.exit_flexibility_score)}</strong>
              </div>
            </div>
            {packet.tax_complexity_flags.length > 0 && (
              <div className="risk-list">
                {packet.tax_complexity_flags.map((flag) => <span key={flag}>{flag}</span>)}
              </div>
            )}
            <div className="two-col-lists single">
              <div>
                <h4>Assumptions</h4>
                <ul>{packet.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
