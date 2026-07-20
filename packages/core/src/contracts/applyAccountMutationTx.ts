import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
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
      const table = mutation.model.drizzleSchema;
      const existingResource = tx
        .select()
        .from(table)
        .where(eq(table.id, mutation.resourceId))
        .get();
      const deletedAt =
        mutation.operation.resource.deletedAt ??
        (existingResource !== undefined && 'deletedAt' in existingResource
          ? existingResource.deletedAt
          : undefined);
      if (deletedAt !== null && deletedAt !== undefined) {
        return yield* new ZerospinError({
          code: 'service-resource-deleted',
          message: `Cannot replicate deleted service resource "${mutation.resourceId}"`,
          extra: {
            modelName: mutation.model.modelName,
            resourceId: mutation.resourceId,
            operationName: mutation.operationName,
            deletedAt,
          },
        });
      }
      yield* Effect.try({
        try: () =>
          upsertHelper({
            table,
            tx,
            values: mutation.operation.resource,
          }),
        catch: cause => {
          const failure = `${ZerospinError.prettyUnknownFailure(cause)}${
            cause instanceof Error && cause.cause !== undefined
              ? `\n${ZerospinError.prettyUnknownFailure(cause.cause)}`
              : ''
          }`;
          if (
            !failure.toLowerCase().includes('foreign key constraint failed')
          ) {
            throw cause;
          }
          return new ZerospinError({
            code: 'mutation-referential-integrity-failed',
            message: `Cannot apply replicateResource mutation to "${mutation.model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: {
              modelName: mutation.model.modelName,
              resourceId: mutation.resourceId,
              operationName: mutation.operationName,
            },
          });
        },
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
