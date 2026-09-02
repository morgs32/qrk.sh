/**
 * Keep only multi-consumer contracts in `types.ts`; move single-consumer shapes to their owner files.
 *
 * @bad Export a type from `*Repo/types.ts` when only one factory/module reads it.
 * @bad Create a one-off `types.ts` alias only to avoid naming a local helper.
 * @bad Leave ad-hoc composition helpers public when they are internal assertions.
 */
import type { AggregateId, MutationShape } from '../../models/types.ts';

type ContractMutationRow = {
  aggregateId: AggregateId;
  mutation: MutationShape;
};

export type IContractMutationIndex = number;

export function normalizeContractMutations(props: {
  mutationIndex: IContractMutationIndex;
  rows: readonly ContractMutationRow[];
}) {
  const rowsById = new Map<string, ContractMutationRow>();

  for (const row of props.rows) {
    if (!rowsById.has(row.mutation.id)) {
      rowsById.set(row.mutation.id, row);
    }
  }

  return {
    mutationIndex: props.mutationIndex,
    rows: [...rowsById.values()],
  };
}
