import { titleCase } from "../../lib/format";
import type { MutationRecord } from "../../types/shared";

interface Props {
  mutations: MutationRecord[];
}

export default function SwingMutationHistory({ mutations }: Props) {
  return (
    <details className="detail-section">
      <summary>Mutation History</summary>
      {mutations.length === 0 ? (
        <p className="detail-copy muted">No mutations applied.</p>
      ) : (
        <ol className="mutation-list">
          {mutations.map((mutation, index) => (
            <li key={`${mutation.iteration}-${mutation.mutation_type}-${index}`} className={mutation.terminal ? "terminal" : ""}>
              <span>Iteration {mutation.iteration}</span>
              <strong>{titleCase(mutation.mutation_type)}</strong>
              <p>{mutation.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
