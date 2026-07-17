import { mapParseError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';

import { applyMutationTx } from './applyMutationTx.ts';
import type { IAnyMutation, IAppliedMutation } from './types.ts';

/** Applies mutations to a frontend projection, including complete replicated resources. */
export const applyFrontendMutationTx = Effect.fn('applyFrontendMutationTx')(
  function* <CONFIG extends IDbConfig>(props: {
    tx: ITx<CONFIG>;
    mutation: IAnyMutation;
    commandId: string;
    mutationIndex: number;
    appliedAt: Date;
  }): Effect.fn.Return<IAppliedMutation, IAnyError> {
    const { appliedAt, commandId, mutation, mutationIndex, tx } = props;
    if (mutation.operationName !== 'replicateResource') {
      return yield* applyMutationTx({
        tx,
        mutation,
        commandId,
        mutationIndex,
        appliedAt,
      });
    }

    const table = mutation.model.drizzleSchema;
    const previousRow = tx
      .select()
      .from(table)
      .where(eq(table.id, mutation.resourceId))
      .get();
    const previousResource =
      previousRow === undefined
        ? null
        : yield* Schema.validate(mutation.model.resourceSchema)(
            previousRow,
          ).pipe(
            mapParseError({
              code: 'replicate-resource-previous-row-invalid',
              prefix: `Failed to decode previous replicated resource "${mutation.resourceId}"`,
            }),
          );

    upsertHelper({
      table,
      tx,
      values: mutation.operation.resource,
    });

    return {
      ...mutation,
      commandId,
      mutationIndex,
      appliedAt,
      lastAppliedAt: previousResource?.updatedAt ?? null,
      inverseOperation:
        previousResource === null
          ? null
          : {
              resource: previousResource,
            },
    };
  },
);
