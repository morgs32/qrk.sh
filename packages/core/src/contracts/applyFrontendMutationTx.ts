import {
  mapParseError,
  ZerospinError,
  type IAnyError,
} from '@zerospin/error';
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

    const deletedAt =
      mutation.operation.resource.deletedAt ??
      (previousRow !== undefined && 'deletedAt' in previousRow
        ? previousRow.deletedAt
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
        if (!failure.toLowerCase().includes('foreign key constraint failed')) {
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
