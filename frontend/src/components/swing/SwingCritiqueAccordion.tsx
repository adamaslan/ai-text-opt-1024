import { scorePct, titleCase } from "../../lib/format";
import type { SwingCritiquePacket } from "../../types/swing";

interface Props {
  packets: SwingCritiquePacket[];
}

export default function SwingCritiqueAccordion({ packets }: Props) {
  return (
    <details className="detail-section" open>
      <summary>A2 Critique</summary>
      <div className="detail-stack">
        {packets.map((packet, index) => (
          <section className="evidence-block" key={`${packet.ticker}-critique-${index}`}>
            <div className="block-heading">
              <strong>Iteration {index + 1}</strong>
              <span className={`verdict-chip verdict-${packet.verdict}`}>{titleCase(packet.verdict)}</span>
              <span>{scorePct(packet.swing_critic_score)}</span>
            </div>
            <div className="fact-grid">
              <span>Entry</span><b>{packet.stop_geometry.entry_zone ?? "-"}</b>
              <span>Invalidation</span><b>{packet.stop_geometry.invalidation_level ?? "-"}</b>
              <span>ATR Distance</span><b>{packet.stop_geometry.atr_distance ?? "-"}</b>
              <span>Risk/Reward</span><b>{packet.stop_geometry.risk_reward_estimate ?? "-"}</b>
              <span>Liquidity</span><b>{packet.liquidity_check}</b>
              <span>Correlation</span><b>{scorePct(packet.correlation_to_accepted)}</b>
            </div>
            {(packet.event_risk.earnings_within_48h || packet.event_risk.fomc_within_48h || packet.event_risk.sector_events.length > 0) && (
              <div className="inline-warning">
                Event risk: {packet.event_risk.earnings_within_48h ? "earnings within 48h " : ""}
                {packet.event_risk.fomc_within_48h ? "FOMC within 48h " : ""}
                {packet.event_risk.sector_events.join(", ")}
              </div>
            )}
            <div className="two-col-lists">
              <div>
                <h4>Findings</h4>
                <ul>{packet.critic_findings.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div>
                <h4>Penalties</h4>
                <ul>{packet.risk_penalties.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
