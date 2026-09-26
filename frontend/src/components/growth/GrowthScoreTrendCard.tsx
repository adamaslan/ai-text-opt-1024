import { scorePct, titleCase } from "../../lib/format";
import type { ScoreTrajectory } from "../../types/growth";
import ScoreTrajectoryChart from "../shared/ScoreTrajectory";

interface Props {
  trajectory: ScoreTrajectory;
  acceptThreshold: number;
  rejectThreshold: number;
}

export default function GrowthScoreTrendCard({ trajectory, acceptThreshold, rejectThreshold }: Props) {
  const points = trajectory.prior_scores.map((score, index) => ({
    label: trajectory.run_dates?.[index] ? new Date(trajectory.run_dates[index]).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : `W${index + 1}`,
    score,
    marker: trajectory.earnings_dates?.[index] ? "E" : undefined,
  }));
  const deterioratingWarning =
    trajectory.score_trend === "deteriorating" && trajectory.prior_scores.length >= 3;

  return (
    <section className="trend-panel">
      <div className="block-heading">
        <strong>{titleCase(trajectory.score_trend)}</strong>
        <span>{trajectory.trend_window_runs} run window</span>
      </div>
      {deterioratingWarning && (
        <div className="inline-warning">Score has deteriorated across the tracked window.</div>
      )}
      <ScoreTrajectoryChart points={points} acceptThreshold={acceptThreshold} rejectThreshold={rejectThreshold} />
      <div className="chip-row">
        {trajectory.prior_scores.map((score, index) => (
          <span key={`${score}-${index}`} className="metric-chip">{scorePct(score)}</span>
        ))}
      </div>
    </section>
  );
}
