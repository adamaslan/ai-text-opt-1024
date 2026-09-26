import DecisionTabs, { DecisionFilter } from "../shared/DecisionTabs";

interface Props {
  active: DecisionFilter;
  counts: Record<DecisionFilter, number>;
  onChange: (decision: DecisionFilter) => void;
}

export default function SwingDecisionTabs(props: Props) {
  return <DecisionTabs {...props} />;
}
