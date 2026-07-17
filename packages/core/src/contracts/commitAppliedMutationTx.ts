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
    const existingServiceResource =
      'serviceName' in model
        ? tx
            .select()
            .from(table)
            .where(eq(table.id, mutation.resourceId))
            .get()
        : undefined;
    if (
      existingServiceResource !== undefined &&
      'deletedAt' in existingServiceResource &&
      existingServiceResource.deletedAt instanceof Date
    ) {
      if (
        mutation.operationName === 'delete' &&
        existingServiceResource.deletedAt instanceof Date &&
        existingServiceResource.deletedAt.getTime() ===
          mutation.appliedAt.getTime()
      ) {
        return {
          ...existingServiceResource,
          deletedAt: existingServiceResource.deletedAt,
        };
      }
      return yield* new ZerospinError({
        code: 'service-resource-deleted',
        message: `Cannot apply ${mutation.operationName} mutation to deleted service resource "${mutation.resourceId}"`,
        extra: {
          modelName: model.modelName,
          resourceId: mutation.resourceId,
          operationName: mutation.operationName,
          deletedAt: existingServiceResource.deletedAt,
        },
      });
    }

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
        yield* Effect.try({
          try: () =>
            upsertHelper({
              table,
              tx,
              values: {
                id: mutation.resourceId,
                createdAt: mutation.appliedAt,
                updatedAt: mutation.appliedAt,
                modelName: model.modelName,
                version: mutation.modelVersion,
                ...('serviceName' in model ? { deletedAt: null } : {}),
                ...encodedAttributes,
              } as never,
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
              message: `Cannot apply create mutation to "${model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: {
                modelName: model.modelName,
                resourceId: mutation.resourceId,
                operationName: mutation.operationName,
              },
            });
          },
        });
        break;
      }
      case 'delete': {
        yield* Effect.try({
          try: () =>
            'serviceName' in model
              ? tx
                  .update(table)
                  .set({
                    ...{ deletedAt: mutation.appliedAt },
                    updatedAt: mutation.appliedAt,
                  })
                  .where(eq(table.id, mutation.resourceId))
                  .run()
              : tx
                  .delete(table)
                  .where(eq(table.id, mutation.resourceId))
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
              message: `Cannot apply delete mutation to "${model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: {
                modelName: model.modelName,
                resourceId: mutation.resourceId,
                operationName: mutation.operationName,
              },
            });
          },
        });
        break;
      }
      case 'move': {
        const property = operation.property;
        if (
          typeof property !== 'string' ||
          typeof operation.nextId !== 'string'
        ) {
          return yield* new ZerospinError({
            code: 'invalid-move-applied-mutation-operation',
            message:
              'Move applied mutation operation must include property and nextId',
          });
        }
        yield* Effect.try({
          try: () =>
            tx
              .update(table)
              .set({
                [property]: operation.nextId,
                updatedAt: mutation.appliedAt,
              } as never)
              .where(eq(table.id, mutation.resourceId))
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
              message: `Cannot apply move mutation to "${model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: {
                modelName: model.modelName,
                resourceId: mutation.resourceId,
                operationName: mutation.operationName,
              },
            });
          },
        });
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
        yield* Effect.try({
          try: () =>
            tx
              .update(table)
              .set({
                updatedAt: mutation.appliedAt,
                ...encodedAttributes,
              } as never)
              .where(eq(table.id, mutation.resourceId))
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
              message: `Cannot apply update mutation to "${model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: {
                modelName: model.modelName,
                resourceId: mutation.resourceId,
                operationName: mutation.operationName,
              },
            });
          },
        });
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
        if (replication.resource.deletedAt !== null) {
          return yield* new ZerospinError({
            code: 'service-resource-deleted',
            message: `Cannot replicate deleted service resource "${mutation.resourceId}"`,
            extra: {
              modelName: model.modelName,
              resourceId: mutation.resourceId,
              operationName: mutation.operationName,
              deletedAt: replication.resource.deletedAt,
            },
          });
        }
        yield* Effect.try({
          try: () =>
            upsertHelper({
              table,
              tx,
              values: replication.resource,
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
              message: `Cannot apply replicateResource mutation to "${model.modelName}.${mutation.resourceId}" because it violates a persisted reference`,
              cause: failure,
              extra: {
                modelName: model.modelName,
                resourceId: mutation.resourceId,
                operationName: mutation.operationName,
              },
            });
          },
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
