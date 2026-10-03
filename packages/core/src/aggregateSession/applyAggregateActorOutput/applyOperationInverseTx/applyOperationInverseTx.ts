import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import type { IEncodedRecord } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema, Struct } from 'effect';
import { pick } from 'es-toolkit';

import type {
  IAppliedOperation,
  IOperation,
} from '../../../contracts/types.ts';
import type { IDbConfig, ITx } from '../../../drizzle/types.ts';
import { upsertHelper } from '../../../drizzle/upsertHelper.ts';
import type { IModel, InferAttributesSchema } from '../../../models/types.ts';

/** Applies an operation inverse inside an open transaction. */
export const applyOperationInverseTx = Effect.fn('applyOperationInverseTx')(
  function* <CONFIG extends IDbConfig>(props: {
    tx: ITx<CONFIG>;
    operation: IAppliedOperation;
  }): Effect.fn.Return<void, IAnyError> {
    const { tx, operation } = props;
    const { previousUpdatedAt, model, operationName, resourceId } = operation;
    const table = model.drizzleSchema;

    switch (operationName) {
      case 'create':
        if (operation.inverseOperation !== null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'pushed-create-inverse-must-be-null',
              message:
                'applyOperationInverseTx: create inverseOperation must be null',
            }),
          );
        }
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
              message: `Cannot apply create operation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      case 'update': {
        if (operation.inverseOperation === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'operation-inverse-required',
              message:
                'applyOperationInverseTx: update operations require inverseOperation',
            }),
          );
        }
        if (previousUpdatedAt === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'operation-last-applied-at-required',
              message:
                'applyOperationInverseTx: update operations require previousUpdatedAt',
            }),
          );
        }
        if (!('attributes' in operation.inverseOperation)) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'invalid-inverse-operation',
              message:
                'applyOperationInverseTx: update inverseOperation must include attributes',
            }),
          );
        }
        const updateOperation = operation as IOperation<IModel, 'update'> &
          Readonly<{
            inverseOperation: { attributes: Record<string, unknown> };
          }>;
        const filtered = updateOperation.body.mask
          ? pick(
              updateOperation.inverseOperation.attributes,
              updateOperation.body.mask,
            )
          : updateOperation.inverseOperation.attributes;
        const encodedAttributes = yield* Schema.encodeUnknownEffect(
          (
            model.attributesSchema as InferAttributesSchema<typeof model>
          ).mapFields(Struct.map(Schema.optional)),
        )(filtered).pipe(
          mapParseError({
            code: 'failed-to-encode-inverse-update-attributes',
            prefix: `Failed to encode inverse update attributes for model "${model.modelName}"`,
          }),
        );
        yield* Effect.try({
          try: () =>
            tx
              .update(table)
              .set({
                updatedAt: previousUpdatedAt,
                ...(encodedAttributes as IEncodedRecord),
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
              message: `Cannot apply update operation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }
      case 'delete': {
        if (operation.inverseOperation === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'operation-inverse-required',
              message:
                'applyOperationInverseTx: delete operations require inverseOperation',
            }),
          );
        }
        if (!('resource' in operation.inverseOperation)) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'invalid-inverse-operation',
              message:
                'applyOperationInverseTx: delete inverseOperation must include resource',
            }),
          );
        }
        const inverseResource = operation.inverseOperation.resource;
        const encodedResource = yield* Schema.encodeUnknownEffect(
          model.table.codec,
        )(inverseResource).pipe(
          mapParseError({
            code: 'failed-to-encode-inverse-resource',
            prefix: `Failed to encode inverse resource for model "${model.modelName}"`,
          }),
        );
        yield* Effect.try({
          try: () =>
            upsertHelper({
              table,
              tx,
              values: {
                ...encodedResource,
                id: inverseResource.id,
                modelName: inverseResource.modelName,
                version: inverseResource.version,
                createdAt: inverseResource.createdAt,
                updatedAt: inverseResource.updatedAt,
              },
            }),
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
              message: `Cannot apply delete operation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }
      case 'move': {
        if (operation.inverseOperation === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'operation-inverse-required',
              message:
                'applyOperationInverseTx: move operations require inverseOperation',
            }),
          );
        }
        if (previousUpdatedAt === null) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'operation-last-applied-at-required',
              message:
                'applyOperationInverseTx: move operations require previousUpdatedAt',
            }),
          );
        }
        if (!('property' in operation.inverseOperation)) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'invalid-inverse-operation',
              message:
                'applyOperationInverseTx: move inverseOperation must include property',
            }),
          );
        }
        const inverseOperation = operation.inverseOperation;
        yield* Effect.try({
          try: () =>
            tx
              .update(table)
              .set({
                [inverseOperation.property]: inverseOperation.prevId,
                updatedAt: previousUpdatedAt,
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
              message: `Cannot apply move operation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }

      default: {
        const _exhaustive: never = operationName;
        return yield* Effect.fail(
          makeZerospinError({
            code: 'unsupported-operation-operation',
            message: `applyOperationInverseTx: unsupported operationName "${String(_exhaustive)}"`,
          }),
        );
      }
    }
  },
);
