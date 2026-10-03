/*
 * applyOperationTx is the only operation write helper that accepts unfinalized
 * operations and captures rollback state. It snapshots `inverseOperation` plus
 * `previousUpdatedAt` before writing, then applies with the caller-provided
 * `appliedAt`.
 *
 * Projection replay remakes inverse state against local resources. Callers
 * that need rollback retain the returned `IAppliedOperation`.
 */

import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import type { InferDecodedRow } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema, Struct } from 'effect';
import { pick } from 'es-toolkit';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type { IModel, InferAttributesSchema } from '../models/types.ts';

import { getResourceRow } from './getResourceRow.ts';
import type { IAnyOperation, IAppliedOperation } from './types.ts';

export const applyOperationTx = Effect.fn('applyOperationTx')(function* <
  CONFIG extends IDbConfig,
>(props: {
  tx: ITx<CONFIG>;
  operation: IAnyOperation;
  commandId: string;
  operationIndex: number;
  appliedAt: Date;
}): Effect.fn.Return<IAppliedOperation, IAnyError> {
  const { appliedAt, commandId, operation, operationIndex, tx } = props;
  const table = operation.model.drizzleSchema;
  const { model, operationName, resourceId } = operation;

  let inverseOperation: IAppliedOperation['inverseOperation'] = null;
  let previousUpdatedAt: Date | null = null;

  switch (operationName) {
    case 'delete': {
      const resourceRow = yield* getResourceRow({
        tx,
        model,
        operationName,
        resourceId,
      });
      const resource = yield* Schema.decodeUnknownEffect(
        Schema.toType(model.resourceSchema),
      )(resourceRow).pipe(
        mapParseError({
          code: 'delete-resource-row-invalid',
          prefix: `Failed to validate deleted resource "${resourceId}"`,
        }),
      );
      inverseOperation = { resource };
      previousUpdatedAt = resourceRow.updatedAt;

      yield* Effect.try({
        try: () => tx.delete(table).where(eq(table.id, resourceId)).run(),
        catch: cause => {
          const failure = `${prettyUnknownFailure(cause)}${
            cause instanceof Error && cause.cause !== undefined
              ? `\n${prettyUnknownFailure(cause.cause)}`
              : ''
          }`;
          if (
            !failure.toLowerCase().includes('foreign key constraint failed')
          ) {
            throw cause;
          }
          return makeZerospinError({
            code: 'operation-referential-integrity-failed',
            message: `Cannot apply delete operation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          });
        },
      });
      break;
    }
    case 'create': {
      const encodedAttributes = yield* Schema.encodeUnknownEffect(
        model.attributesSchema as InferAttributesSchema<typeof model>,
      )(operation.body.attributes).pipe(
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
              version: operation.modelVersion,
              ...encodedAttributes,
            })
            .run(),
        catch: cause => {
          const failure = `${prettyUnknownFailure(cause)}${
            cause instanceof Error && cause.cause !== undefined
              ? `\n${prettyUnknownFailure(cause.cause)}`
              : ''
          }`;
          if (
            !failure.toLowerCase().includes('foreign key constraint failed')
          ) {
            throw cause;
          }
          return makeZerospinError({
            code: 'operation-referential-integrity-failed',
            message: `Cannot apply create operation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
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
      const attributeKeys = Object.keys(model.attributes);
      const rawAttributes: Record<string, unknown> = {};

      for (const key of attributeKeys) {
        rawAttributes[key] = resourceRow[key];
      }

      const rowAttributes = yield* Schema.decodeUnknownEffect(
        Schema.toType(
          model.attributesSchema as InferAttributesSchema<typeof model>,
        ),
      )(rawAttributes).pipe(
        mapParseError({
          code: 'failed-to-decode-row-attributes',
          prefix: `Failed to decode row attributes for model "${model.modelName}"`,
        }),
      );
      inverseOperation = {
        attributes: operation.body.mask
          ? pick(
              rowAttributes as InferDecodedRow<IModel['attributes']>,
              operation.body.mask,
            )
          : rowAttributes,
      };
      previousUpdatedAt = resourceRow.updatedAt;

      const filtered = operation.body.mask
        ? pick(operation.body.attributes, operation.body.mask)
        : operation.body.attributes;

      const encodedAttributes = yield* Schema.encodeUnknownEffect(
        (
          model.attributesSchema as InferAttributesSchema<typeof model>
        ).mapFields(Struct.map(Schema.optional)),
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
          const failure = `${prettyUnknownFailure(cause)}${
            cause instanceof Error && cause.cause !== undefined
              ? `\n${prettyUnknownFailure(cause.cause)}`
              : ''
          }`;
          if (
            !failure.toLowerCase().includes('foreign key constraint failed')
          ) {
            throw cause;
          }
          return makeZerospinError({
            code: 'operation-referential-integrity-failed',
            message: `Cannot apply update operation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
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
      inverseOperation = {
        property: operation.body.property,
        prevId: operation.body.prevId,
      };
      previousUpdatedAt = resourceRow.updatedAt;

      yield* Effect.try({
        try: () =>
          tx
            .update(table)
            .set({
              [operation.body.property]: operation.body.nextId,
              updatedAt: appliedAt,
            })
            .where(eq(table.id, resourceId))
            .run(),
        catch: cause => {
          const failure = `${prettyUnknownFailure(cause)}${
            cause instanceof Error && cause.cause !== undefined
              ? `\n${prettyUnknownFailure(cause.cause)}`
              : ''
          }`;
          if (
            !failure.toLowerCase().includes('foreign key constraint failed')
          ) {
            throw cause;
          }
          return makeZerospinError({
            code: 'operation-referential-integrity-failed',
            message: `Cannot apply move operation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          });
        },
      });
      break;
    }
    default: {
      const _exhaustive: never = operationName;
      return yield* Effect.fail(
        makeZerospinError({
          code: 'unsupported-operation-operation',
          message: `applyOperationTx: unsupported operation "${String(_exhaustive)}"`,
        }),
      );
    }
  }

  return {
    ...operation,
    commandId,
    operationIndex,
    appliedAt,
    previousUpdatedAt,
    inverseOperation,
  };
});
