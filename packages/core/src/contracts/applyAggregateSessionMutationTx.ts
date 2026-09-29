import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';

import { applyMutationTx } from './applyMutationTx.ts';
import type { IAnyMutation, IAppliedMutation } from './types.ts';

/** Applies mutations to a definition projection, including complete replicated resources. */
export const applyAggregateSessionMutationTx = Effect.fn(
  'applyAggregateSessionMutationTx',
)(function* <CONFIG extends IDbConfig>(props: {
  tx: ITx<CONFIG>;
  mutation: IAnyMutation;
  commandId: string;
  mutationIndex: number;
  appliedAt: Date;
}): Effect.fn.Return<IAppliedMutation, IAnyError> {
  const { appliedAt, commandId, mutation, mutationIndex, tx } = props;
  if (mutation.operationName !== 'replicate') {
    return yield* applyMutationTx({
      tx,
      mutation,
      commandId,
      mutationIndex,
      appliedAt,
    });
  }

  const table = mutation.model.drizzleSchema;
  const query = tx.query[mutation.model.modelName];
  if (query === undefined) {
    throw new Error(
      `Missing registered model query: ${mutation.model.modelName}`,
    );
  }
  const previousRow = query
    .findFirst({ where: { id: mutation.resourceId } } as Parameters<
      typeof query.findFirst
    >[0])
    .sync();
  const previousResource =
    previousRow === undefined
      ? null
      : yield* Schema.decodeUnknownEffect(
          Schema.toType(mutation.model.resourceSchema),
        )(previousRow).pipe(
          mapParseError({
            code: 'replicate-resource-previous-row-invalid',
            prefix: `Failed to decode previous replicated resource "${mutation.resourceId}"`,
          }),
        );

  const deletedAt = mutation.operation.resource.deletedAt;
  if (deletedAt !== null && deletedAt !== undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-resource-deleted',
        message: `Cannot replicate deleted service resource "${mutation.resourceId}"`,
        extra: {
          modelName: mutation.model.modelName,
          resourceId: mutation.resourceId,
          operationName: mutation.operationName,
          deletedAt,
        },
      }),
    );
  }

  const encodedResource = yield* Schema.encodeUnknownEffect(
    mutation.model.table.codec,
  )(mutation.operation.resource).pipe(
    mapParseError({
      code: 'replicate-resource-row-invalid',
      prefix: `Failed to encode replicated resource "${mutation.resourceId}"`,
    }),
  );
  yield* Effect.try({
    try: () =>
      upsertHelper({
        table,
        tx,
        values: {
          ...encodedResource,
          id: mutation.operation.resource.id,
          modelName: mutation.operation.resource.modelName,
          version: mutation.operation.resource.version,
          createdAt: mutation.operation.resource.createdAt,
          updatedAt: mutation.operation.resource.updatedAt,
        },
      }),
    catch: cause => {
      const failure = `${prettyUnknownFailure(cause)}${
        cause instanceof Error && cause.cause !== undefined
          ? `\n${prettyUnknownFailure(cause.cause)}`
          : ''
      }`;
      if (!failure.toLowerCase().includes('foreign key constraint failed')) {
        throw cause;
      }
      return makeZerospinError({
        code: 'mutation-referential-integrity-failed',
        message: `Cannot apply replicate mutation to "${mutation.model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
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
    previousUpdatedAt: previousResource?.updatedAt ?? null,
    inverseOperation:
      previousResource === null
        ? null
        : {
            resource: previousResource,
          },
  };
});
