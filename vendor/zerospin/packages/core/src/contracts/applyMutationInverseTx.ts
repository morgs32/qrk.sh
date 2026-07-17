import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { pick } from 'es-toolkit';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IEncodedRecord,
  IModel,
  InferAttributesSchema,
} from '../models/types.ts';

import type { IAppliedMutation, IMutation } from './types.ts';

/** Applies a mutation inverse inside an open transaction. */
export const applyMutationInverseTx = Effect.fn('applyMutationInverseTx')(
  function* <CONFIG extends IDbConfig>(props: {
    tx: ITx<CONFIG>;
    mutation: IAppliedMutation;
  }): Effect.fn.Return<void, IAnyError> {
    const { tx, mutation } = props;
    const { lastAppliedAt, model, operationName, resourceId } = mutation;
    const table = model.drizzleSchema;

    switch (operationName) {
      case 'create':
        if (mutation.inverseOperation !== null) {
          return yield* new ZerospinError({
            code: 'pushed-create-inverse-must-be-null',
            message:
              'applyMutationInverseTx: create inverseOperation must be null',
          });
        }
        yield* Effect.try({
          try: () =>
            tx.delete(table).where(eq(table.id, resourceId)).run(),
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
              message: `Cannot apply create mutation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      case 'update': {
        if (mutation.inverseOperation === null) {
          return yield* new ZerospinError({
            code: 'mutation-inverse-required',
            message:
              'applyMutationInverseTx: update mutations require inverseOperation',
          });
        }
        if (lastAppliedAt === null) {
          return yield* new ZerospinError({
            code: 'mutation-last-applied-at-required',
            message:
              'applyMutationInverseTx: update mutations require lastAppliedAt',
          });
        }
        if (!('attributes' in mutation.inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'applyMutationInverseTx: update inverseOperation must include attributes',
          });
        }
        const updateMutation = mutation as IMutation<IModel, 'update'> &
          Readonly<{
            inverseOperation: { attributes: Record<string, unknown> };
          }>;
        const filtered = updateMutation.operation.mask
          ? pick(
              updateMutation.inverseOperation.attributes,
              updateMutation.operation.mask,
            )
          : updateMutation.inverseOperation.attributes;
        const encodedAttributes = yield* Schema.encodeUnknown(
          Schema.partial(
            model.attributesSchema as InferAttributesSchema<typeof model>,
          ),
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
                updatedAt: lastAppliedAt,
                ...(encodedAttributes as IEncodedRecord),
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
              message: `Cannot apply update mutation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }
      case 'delete': {
        if (mutation.inverseOperation === null) {
          return yield* new ZerospinError({
            code: 'mutation-inverse-required',
            message:
              'applyMutationInverseTx: delete mutations require inverseOperation',
          });
        }
        if (!('resource' in mutation.inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'applyMutationInverseTx: delete inverseOperation must include resource',
          });
        }
        const inverseResource = mutation.inverseOperation.resource;
        yield* Effect.try({
          try: () =>
            upsertHelper({
              table,
              tx,
              values: inverseResource,
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
              message: `Cannot apply delete mutation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }
      case 'move': {
        if (mutation.inverseOperation === null) {
          return yield* new ZerospinError({
            code: 'mutation-inverse-required',
            message:
              'applyMutationInverseTx: move mutations require inverseOperation',
          });
        }
        if (lastAppliedAt === null) {
          return yield* new ZerospinError({
            code: 'mutation-last-applied-at-required',
            message:
              'applyMutationInverseTx: move mutations require lastAppliedAt',
          });
        }
        if (!('property' in mutation.inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'applyMutationInverseTx: move inverseOperation must include property',
          });
        }
        const inverseOperation = mutation.inverseOperation;
        yield* Effect.try({
          try: () =>
            tx
              .update(table)
              .set({
                [inverseOperation.property]: inverseOperation.prevId,
                updatedAt: lastAppliedAt,
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
              message: `Cannot apply move mutation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }
      case 'replicateResource': {
        if (mutation.inverseOperation === null) {
          yield* Effect.try({
            try: () =>
              tx.delete(table).where(eq(table.id, resourceId)).run(),
            catch: cause => {
              const failure = `${ZerospinError.prettyUnknownFailure(cause)}${
                cause instanceof Error && cause.cause !== undefined
                  ? `\n${ZerospinError.prettyUnknownFailure(cause.cause)}`
                  : ''
              }`;
              if (
                !failure
                  .toLowerCase()
                  .includes('foreign key constraint failed')
              ) {
                throw cause;
              }
              return new ZerospinError({
                code: 'mutation-referential-integrity-failed',
                message: `Cannot apply replicateResource mutation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
                cause: failure,
                extra: {
                  modelName: model.modelName,
                  resourceId,
                  operationName,
                },
              });
            },
          });
          return;
        }
        if (!('resource' in mutation.inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'applyMutationInverseTx: replicateResource inverseOperation must include resource',
          });
        }
        const inverseResource = mutation.inverseOperation.resource;
        yield* Effect.try({
          try: () =>
            upsertHelper({
              table,
              tx,
              values: inverseResource,
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
              message: `Cannot apply replicateResource mutation inverse to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: { modelName: model.modelName, resourceId, operationName },
            });
          },
        });
        return;
      }
      default: {
        const _exhaustive: never = operationName;
        return yield* new ZerospinError({
          code: 'unsupported-mutation-operation',
          message: `applyMutationInverseTx: unsupported operationName "${String(_exhaustive)}"`,
        });
      }
    }
  },
);
