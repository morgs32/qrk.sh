/**
 * Keep only multi-consumer contracts in `types.ts`; move single-consumer shapes to their owner files.
 *
 * @bad Export a type from `*Repo/types.ts` when only one factory/module reads it.
 * @bad Create a one-off `types.ts` alias only to avoid naming a local helper.
 * @bad Leave ad-hoc composition helpers public when they are internal assertions.
 */
import type { AccountId, MutationShape } from '../../models/types.ts';

type ContractMutationRow = {
  accountId: AccountId;
  mutation: MutationShape;
};

export type IContractMutationCursor = string;

export function normalizeContractMutations(props: {
  cursor: IContractMutationCursor;
  rows: readonly ContractMutationRow[];
}) {
  const rowsById = new Map<string, ContractMutationRow>();

  for (const row of props.rows) {
    if (!rowsById.has(row.mutation.id)) {
      rowsById.set(row.mutation.id, row);
    }
  }

  return {
    cursor: props.cursor,
    rows: [...rowsById.values()],
  };
}
