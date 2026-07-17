/*
 * commitAppliedMutationTx applies an already-encoded applied mutation to a
 * replica table. It does not rebuild command mutations or encode mutation
 * payloads; the encoded operation fields are the write source.
 */

import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type { IEncodedResourceShape, IModels } from '../models/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import type { IEncodedAppliedMutation } from './types.ts';

export const commitAppliedMutationTx = Effect.fn('commitAppliedMutationTx')(
  function* (props: {
    tx: ITx;
    models: IModels;
    mutation: IEncodedAppliedMutation;
  }): Effect.fn.Return<IEncodedResourceShape | null, IAnyError> {
    const { models, mutation, tx } = props;
    const model = yield* getByKeyOrThrow({
      record: models,
      key: mutation.modelName,
      recordKind: 'models',
    });
    const table = model.drizzleSchema;
    const operation = yield* Effect.try({
      try: () => JSON.parse(mutation.operation) as Record<string, unknown>,
      catch: ZerospinError.catch({
        code: 'applied-mutation-operation-parse-failed',
        message: 'Failed to parse encoded applied mutation operation',
      }),
    });

    switch (mutation.operationName) {
      case 'create': {
        const encodedAttributes = operation.encodedAttributes;
        if (
          encodedAttributes === null ||
          typeof encodedAttributes !== 'object' ||
          Array.isArray(encodedAttributes)
        ) {
          return yield* new ZerospinError({
            code: 'invalid-create-applied-mutation-operation',
            message:
              'Create applied mutation operation must include encodedAttributes',
          });
        }
        upsertHelper({
          table,
          tx,
          values: {
            id: mutation.resourceId,
            createdAt: mutation.appliedAt,
            updatedAt: mutation.appliedAt,
            modelName: model.modelName,
            version: mutation.modelVersion,
            ...encodedAttributes,
          } as never,
        });
        break;
      }
      case 'delete': {
        tx.delete(table).where(eq(table.id, mutation.resourceId)).run();
        break;
      }
      case 'move': {
        if (
          typeof operation.property !== 'string' ||
          typeof operation.nextId !== 'string'
        ) {
          return yield* new ZerospinError({
            code: 'invalid-move-applied-mutation-operation',
            message:
              'Move applied mutation operation must include property and nextId',
          });
        }
        tx.update(table)
          .set({
            [operation.property]: operation.nextId,
            updatedAt: mutation.appliedAt,
          } as never)
          .where(eq(table.id, mutation.resourceId))
          .run();
        break;
      }
      case 'update': {
        const encodedAttributes = operation.encodedAttributes;
        if (
          encodedAttributes === null ||
          typeof encodedAttributes !== 'object' ||
          Array.isArray(encodedAttributes)
        ) {
          return yield* new ZerospinError({
            code: 'invalid-update-applied-mutation-operation',
            message:
              'Update applied mutation operation must include encodedAttributes',
          });
        }
        tx.update(table)
          .set({
            updatedAt: mutation.appliedAt,
            ...encodedAttributes,
          } as never)
          .where(eq(table.id, mutation.resourceId))
          .run();
        break;
      }
      case 'replicateResource': {
        const replication = yield* Schema.decodeUnknown(
          Schema.Struct({
            serviceName: Schema.String,
            resource: model.resourceSchema,
          }),
        )(operation).pipe(
          mapParseError({
            code: 'invalid-replicate-resource-applied-mutation-operation',
            prefix:
              'Replicate resource applied mutation operation must include a complete resource',
          }),
        );
        upsertHelper({
          table,
          tx,
          values: replication.resource,
        });
        break;
      }
      default: {
        const _exhaustive: never = mutation.operationName;
        return yield* new ZerospinError({
          code: 'unsupported-applied-mutation-operation',
          message: `Unsupported applied mutation operation "${String(_exhaustive)}"`,
        });
      }
    }

    const row = tx
      .select()
      .from(table)
      .where(eq(table.id, mutation.resourceId))
      .get();

    return (row ?? null) as IEncodedResourceShape | null;
  },
);
