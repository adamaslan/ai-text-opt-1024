import { compactDate, relativeTime } from "../../lib/format";
import StaleDataBadge from "./StaleDataBadge";

interface Props {
  computedAt?: string;
  sourceFreshness?: Record<string, string>;
  isStale?: boolean;
}

export default function SourceFreshness({ computedAt, sourceFreshness, isStale }: Props) {
  const entries = Object.entries(sourceFreshness ?? {}).slice(0, 3);
  const label = computedAt ?? entries[0]?.[1];

  return (
    <span className="freshness">
      <span title={compactDate(label)}>{relativeTime(label)}</span>
      <StaleDataBadge isStale={isStale} />
    </span>
  );
}
