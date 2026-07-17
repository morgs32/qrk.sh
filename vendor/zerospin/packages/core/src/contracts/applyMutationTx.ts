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

      tx.delete(table).where(eq(table.id, resourceId)).run();
      break;
    }
    case 'create': {
      const encodedAttributes = yield* Schema.encodeUnknown(
        model.attributesSchema as InferAttributesSchema<typeof model>,
      )(mutation.operation.attributes).pipe(
        mapParseError({
          code: 'failed-to-encode-create-attributes',
          prefix: `Failed to encode attributes for model "${model.modelName}"`,
        }),
      );
      tx.insert(table)
        .values({
          id: resourceId,
          createdAt: appliedAt,
          updatedAt: appliedAt,
          modelName: model.modelName,
          version: mutation.modelVersion,
          ...encodedAttributes,
        })
        .run();
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
      tx.update(table)
        .set({
          updatedAt: appliedAt,
          ...encodedAttributes,
        })
        .where(eq(table.id, resourceId))
        .run();
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
        property: mutation.operation.property,
        prevId: mutation.operation.prevId,
      };
      lastAppliedAt = resourceRow.updatedAt;

      tx.update(table)
        .set({
          [mutation.operation.property]: mutation.operation.nextId,
          updatedAt: appliedAt,
        })
        .where(eq(table.id, resourceId))
        .run();
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
