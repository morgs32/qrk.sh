/*
 * applyMutationTx is the only mutation write helper that accepts unfinalized
 * mutations and captures rollback state. It snapshots `inverseOperation` plus
 * `lastAppliedAt` before writing, then applies with the caller-provided
 * `appliedAt`.
 *
 * Replica replay deliberately remakes inverse state against the local replica,
 * even when the upstream encoded applied mutation already contains inverse
 * metadata. Callers that need rollback must keep or encode the returned
 * `IAppliedMutation`.
 */

import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { pick } from 'es-toolkit';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type {
  IModel,
  InferAttributesSchema,
  InferDecodedRow,
} from '../models/types.ts';

import { getResourceRow } from './getResourceRow.ts';
import type { IAnyMutation, IAppliedMutation } from './types.ts';

export const applyMutationTx = Effect.fn('applyMutationTx')(function* <
  CONFIG extends IDbConfig,
>(props: {
  tx: ITx<CONFIG>;
  mutation: Exclude<
    IAnyMutation,
    { readonly operationName: 'replicateResource' }
  >;
  commandId: string;
  mutationIndex: number;
  appliedAt: Date;
}): Effect.fn.Return<IAppliedMutation, IAnyError> {
  const { appliedAt, commandId, mutation, mutationIndex, tx } = props;
  const table = mutation.model.drizzleSchema;
  const { model, operationName, resourceId } = mutation;

  let inverseOperation: IAppliedMutation['inverseOperation'] = null;
  let lastAppliedAt: Date | null = null;

  switch (operationName) {
    case 'delete': {
      const resourceRow = yield* getResourceRow({
        tx,
        model,
        operationName,
        resourceId,
      });

      if ('serviceName' in model && resourceRow.deletedAt !== null) {
        if (
          resourceRow.deletedAt instanceof Date &&
          resourceRow.deletedAt.getTime() === appliedAt.getTime()
        ) {
          return {
            ...mutation,
            commandId,
            mutationIndex,
            appliedAt,
            lastAppliedAt: resourceRow.updatedAt,
            inverseOperation: null,
          };
        }
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

      const resource = yield* Schema.validate(model.resourceSchema)(
        resourceRow,
      ).pipe(
        mapParseError({
          code: 'delete-resource-row-invalid',
          prefix: `Failed to validate deleted resource "${resourceId}"`,
        }),
      );
      inverseOperation = { resource };
      lastAppliedAt = resourceRow.updatedAt;

      yield* Effect.try({
        try: () =>
          'serviceName' in model
            ? tx
                .update(table)
                .set({ ...{ deletedAt: appliedAt }, updatedAt: appliedAt })
                .where(eq(table.id, resourceId))
                .run()
            : tx.delete(table).where(eq(table.id, resourceId)).run(),
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
            message: `Cannot apply delete mutation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          });
        },
      });
      break;
    }
    case 'create': {
      if ('serviceName' in model) {
        const existingResource = tx
          .select()
          .from(table)
          .where(eq(table.id, resourceId))
          .get();
        if (
          existingResource !== undefined &&
          'deletedAt' in existingResource &&
          existingResource.deletedAt !== null
        ) {
          return yield* new ZerospinError({
            code: 'service-resource-deleted',
            message: `Cannot apply create mutation to deleted service resource "${resourceId}"`,
            extra: {
              modelName: model.modelName,
              resourceId,
              operationName,
              deletedAt: existingResource.deletedAt,
            },
          });
        }
      }
      const encodedAttributes = yield* Schema.encodeUnknown(
        model.attributesSchema as InferAttributesSchema<typeof model>,
      )(mutation.operation.attributes).pipe(
        mapParseError({
          code: 'failed-to-encode-create-attributes',
          prefix: `Failed to encode attributes for model "${model.modelName}"`,
        }),
      );
      yield* Effect.try({
        try: () =>
          tx
            .insert(table)
            .values({
              id: resourceId,
              createdAt: appliedAt,
              updatedAt: appliedAt,
              modelName: model.modelName,
              version: mutation.modelVersion,
              ...('serviceName' in model ? { deletedAt: null } : {}),
              ...encodedAttributes,
            })
            .run(),
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
            message: `Cannot apply create mutation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          });
        },
      });
      break;
    }
    case 'update': {
      const resourceRow = yield* getResourceRow({
        tx,
        model,
        operationName,
        resourceId,
      });
      if ('serviceName' in model && resourceRow.deletedAt !== null) {
        return yield* new ZerospinError({
          code: 'service-resource-deleted',
          message: `Cannot apply update mutation to deleted service resource "${resourceId}"`,
          extra: {
            modelName: model.modelName,
            resourceId,
            operationName,
            deletedAt: resourceRow.deletedAt,
          },
        });
      }
      const attributeKeys = Object.keys(model.attributes);
      const rawAttributes: Record<string, unknown> = {};

      for (const key of attributeKeys) {
        rawAttributes[key] = resourceRow[key];
      }

      const rowAttributes = yield* Schema.decodeUnknown(
        model.attributesSchema as InferAttributesSchema<typeof model>,
      )(rawAttributes).pipe(
        mapParseError({
          code: 'failed-to-decode-row-attributes',
          prefix: `Failed to decode row attributes for model "${model.modelName}"`,
        }),
      );
      inverseOperation = {
        attributes: mutation.operation.mask
          ? pick(
              rowAttributes as InferDecodedRow<IModel['attributes']>,
              mutation.operation.mask,
            )
          : rowAttributes,
      };
      lastAppliedAt = resourceRow.updatedAt;

      const filtered = mutation.operation.mask
        ? pick(mutation.operation.attributes, mutation.operation.mask)
        : mutation.operation.attributes;

      const encodedAttributes = yield* Schema.encodeUnknown(
        Schema.partial(
          model.attributesSchema as InferAttributesSchema<typeof model>,
        ),
      )(filtered).pipe(
        mapParseError({
          code: 'failed-to-encode-update-attributes',
          prefix: `Failed to encode attributes for model "${model.modelName}"`,
        }),
      );
      yield* Effect.try({
        try: () =>
          tx
            .update(table)
            .set({
              updatedAt: appliedAt,
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
          if (!failure.toLowerCase().includes('foreign key constraint failed')) {
            throw cause;
          }
          return new ZerospinError({
            code: 'mutation-referential-integrity-failed',
            message: `Cannot apply update mutation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          });
        },
      });
      break;
    }
    case 'move': {
      const resourceRow = yield* getResourceRow({
        tx,
        model,
        operationName,
        resourceId,
      });
      if ('serviceName' in model && resourceRow.deletedAt !== null) {
        return yield* new ZerospinError({
          code: 'service-resource-deleted',
          message: `Cannot apply move mutation to deleted service resource "${resourceId}"`,
          extra: {
            modelName: model.modelName,
            resourceId,
            operationName,
            deletedAt: resourceRow.deletedAt,
          },
        });
      }
      inverseOperation = {
        property: mutation.operation.property,
        prevId: mutation.operation.prevId,
      };
      lastAppliedAt = resourceRow.updatedAt;

      yield* Effect.try({
        try: () =>
          tx
            .update(table)
            .set({
              [mutation.operation.property]: mutation.operation.nextId,
              updatedAt: appliedAt,
            })
            .where(eq(table.id, resourceId))
            .run(),
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
            message: `Cannot apply move mutation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          });
        },
      });
      break;
    }
    default: {
      const _exhaustive: never = operationName;
      return yield* new ZerospinError({
        code: 'unsupported-mutation-operation',
        message: `applyMutationTx: unsupported operation "${String(_exhaustive)}"`,
      });
    }
  }

  return {
    ...mutation,
    commandId,
    mutationIndex,
    appliedAt,
    lastAppliedAt,
    inverseOperation,
  };
});
