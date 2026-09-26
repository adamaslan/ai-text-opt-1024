import { scorePct } from "../../lib/format";

export interface ScorePoint {
  label: string;
  score: number;
  mutation?: string;
  marker?: string;
}

interface Props {
  points: ScorePoint[];
  acceptThreshold: number;
  rejectThreshold: number;
}

export default function ScoreTrajectory({ points, acceptThreshold, rejectThreshold }: Props) {
  const safePoints = points.length ? points : [{ label: "1", score: 0, mutation: "none" }];
  const width = 420;
  const height = 180;
  const padX = 34;
  const padY = 18;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;

  const pointToCoord = (score: number, index: number) => {
    const x = padX + (safePoints.length === 1 ? innerWidth / 2 : (index / (safePoints.length - 1)) * innerWidth);
    const y = padY + (1 - Math.max(0, Math.min(1, score))) * innerHeight;
    return { x, y };
  };

  const line = safePoints
    .map((point, index) => {
      const { x, y } = pointToCoord(point.score, index);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const thresholdY = (threshold: number) => padY + (1 - threshold) * innerHeight;

  return (
    <div className="trajectory">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Score trajectory">
        <line className="trajectory-grid" x1={padX} x2={width - padX} y1={thresholdY(acceptThreshold)} y2={thresholdY(acceptThreshold)} />
        <line className="trajectory-grid reject" x1={padX} x2={width - padX} y1={thresholdY(rejectThreshold)} y2={thresholdY(rejectThreshold)} />
        <text x={width - padX + 4} y={thresholdY(acceptThreshold) + 4} className="trajectory-label">
          accept {scorePct(acceptThreshold)}
        </text>
        <text x={width - padX + 4} y={thresholdY(rejectThreshold) + 4} className="trajectory-label">
          reject {scorePct(rejectThreshold)}
        </text>
        <path d={line} className="trajectory-line" />
        {safePoints.map((point, index) => {
          const { x, y } = pointToCoord(point.score, index);
          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r="4.5" className="trajectory-point">
                <title>{`${point.label}: ${scorePct(point.score)}${point.mutation ? `, ${point.mutation}` : ""}`}</title>
              </circle>
              <text x={x} y={height - 5} textAnchor="middle" className="trajectory-label">
                {point.label}
              </text>
              {point.marker && (
                <text x={x} y={Math.max(12, y - 9)} textAnchor="middle" className="trajectory-marker">
                  {point.marker}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
