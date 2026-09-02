import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';

import { applyMutationTx } from './applyMutationTx.ts';
import { getResourceRow } from './getResourceRow.ts';
import type { IAnyMutation, IAppliedMutation } from './types.ts';

/** Applies aggregate-owned mutations, including canonical service replicas. */
export const applyAggregateMutationTx = Effect.fn('applyAggregateMutationTx')(
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
      const previousRow = tx
        .select()
        .from(table)
        .where(eq(table.id, mutation.resourceId))
        .get();
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
        lastAppliedAt: previousResource?.updatedAt ?? null,
        inverseOperation:
          previousResource === null
            ? null
            : {
                resource: previousResource,
              },
      };
    }

    const { model, operationName, resourceId } = mutation;
    if (!('sourceModel' in model)) {
      return yield* applyMutationTx({
        tx,
        mutation,
        commandId,
        mutationIndex,
        appliedAt,
      });
    }

    const table = model.drizzleSchema;

    if (operationName === 'delete') {
      const resourceRow = yield* getResourceRow({
        tx,
        model,
        operationName,
        resourceId,
      });
      if (resourceRow.deletedAt !== null) {
        return yield* new ZerospinError({
          code: 'service-resource-deleted',
          message: `Cannot apply delete mutation to deleted service resource "${resourceId}"`,
          extra: {
            modelName: model.modelName,
            resourceId,
            operationName,
            deletedAt: resourceRow.deletedAt,
          },
        });
      }
      const resource = yield* Schema.decodeUnknownEffect(
        Schema.toType(model.resourceSchema),
      )(resourceRow).pipe(
        mapParseError({
          code: 'delete-resource-row-invalid',
          prefix: `Failed to validate deleted resource "${resourceId}"`,
        }),
      );

      tx.update(table)
        .set({ ...{ deletedAt: appliedAt }, updatedAt: appliedAt })
        .where(eq(table.id, resourceId))
        .run();

      return {
        ...mutation,
        commandId,
        mutationIndex,
        appliedAt,
        lastAppliedAt: resourceRow.updatedAt,
        inverseOperation: { resource },
      };
    }

    const existingResource = tx
      .select()
      .from(table)
      .where(eq(table.id, resourceId))
      .get();

    if (operationName === 'create') {
      if (
        existingResource === undefined ||
        !('deletedAt' in existingResource) ||
        existingResource.deletedAt === null
      ) {
        return yield* applyMutationTx({
          tx,
          mutation,
          commandId,
          mutationIndex,
          appliedAt,
        });
      }

      const encodedAttributes = yield* Schema.encodeUnknownEffect(
        model.attributesSchema,
      )(mutation.operation.attributes).pipe(
        mapParseError({
          code: 'failed-to-encode-create-attributes',
          prefix: `Failed to encode attributes for model "${model.modelName}"`,
        }),
      );
      yield* Effect.try({
        try: () =>
          tx
            .update(table)
            .set({
              createdAt: appliedAt,
              updatedAt: appliedAt,
              version: mutation.modelVersion,
              ...{ deletedAt: null },
              ...encodedAttributes,
            })
            .where(eq(table.id, resourceId))
            .run(),
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
            message: `Cannot apply create mutation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
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

    if (
      existingResource !== undefined &&
      'deletedAt' in existingResource &&
      existingResource.deletedAt !== null
    ) {
      return yield* new ZerospinError({
        code: 'service-resource-deleted',
        message: `Cannot apply ${operationName} mutation to deleted service resource "${resourceId}"`,
        extra: {
          modelName: model.modelName,
          resourceId,
          operationName,
          deletedAt: existingResource.deletedAt,
        },
      });
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
