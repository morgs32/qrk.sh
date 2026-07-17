import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';

import { applyMutationTx } from './applyMutationTx.ts';
import type { IAnyMutation, IAppliedMutation } from './types.ts';

/** Applies account-owned mutations, including canonical service replicas. */
export const applyAccountMutationTx = Effect.fn('applyAccountMutationTx')(
  function* <CONFIG extends IDbConfig>(props: {
    tx: ITx<CONFIG>;
    mutation: IAnyMutation;
    commandId: string;
    mutationIndex: number;
    appliedAt: Date;
  }): Effect.fn.Return<IAppliedMutation, IAnyError> {
    const { appliedAt, commandId, mutation, mutationIndex, tx } = props;
    if (mutation.operationName === 'replicateResource') {
      upsertHelper({
        table: mutation.model.drizzleSchema,
        tx,
        values: mutation.operation.resource,
      });
      return {
        ...mutation,
        commandId,
        mutationIndex,
        appliedAt,
        lastAppliedAt: null,
        inverseOperation: null,
      };
    }

    return yield* applyMutationTx({
      tx,
      mutation,
      commandId,
      mutationIndex,
      appliedAt,
    });
  },
);
