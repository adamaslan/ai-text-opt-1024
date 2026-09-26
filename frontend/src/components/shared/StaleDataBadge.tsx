interface Props {
  isStale?: boolean;
}

export default function StaleDataBadge({ isStale }: Props) {
  if (!isStale) return null;
  return <span className="status-badge stale">Stale Data</span>;
}
