interface Props {
  aiDegraded?: boolean;
}

export default function AiDegradedBadge({ aiDegraded }: Props) {
  if (!aiDegraded) return null;
  return <span className="status-badge degraded">AI Degraded</span>;
}
