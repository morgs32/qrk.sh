import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import { applyMutationInverseTx } from '../contracts/applyMutationInverseTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import type { IEncodedCommand } from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  AggregateFrontendFinalizedCommandSchema,
  AggregateFrontendJournalCommandSchema,
  AggregateFrontendPushedCommandSchema,
} from './AggregateFrontendCommandSchema.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import {
  sessionMetadataDrizzleSchema,
  sessionResolvedPushDrizzleSchema,
} from './sessionRepoTables.ts';
import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendPushedCommand,
  IAggregateFrontendSyncState,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

export const applyAggregateFrontendCommand = Effect.fn(
  'applyAggregateFrontendCommand',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  models: InferFrontendModels<FRONTEND>;
  command:
    | IEncodedCommand<IAggregateFrontendFinalizedCommand>
    | IEncodedCommand<IAggregateFrontendPushedCommand>;
  aggregateId: IAggregateFrontendSyncState['aggregateId'];
  userId: IAggregateFrontendSyncState['userId'];
  sessionId: ISessionId;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  const { aggregateId, command, db, frontend, models, sessionId, userId } =
    props;

  if ('frontendIndex' in command) {
    yield* Schema.encodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)(
      command,
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-finalized-command-encode-failed',
        prefix: 'Failed to encode finalized aggregate frontend command',
      }),
    );
  } else {
    yield* Schema.encodeUnknownEffect(AggregateFrontendPushedCommandSchema)(
      command,
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-pushed-command-encode-failed',
        prefix: 'Failed to encode pushed aggregate frontend command',
      }),
    );
  }

  if (
    'aggregateId' in command &&
    (command.aggregateId !== aggregateId ||
      command.aggregateName !== frontend.aggregateName ||
      command.systemName !== frontend.systemName ||
      (command.userId !== null && command.userId !== userId) ||
      (command.frontendName !== null &&
        command.frontendName !== frontend.frontendName))
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-command-target-mismatch',
      message: 'Aggregate frontend command does not match the bound target',
    });
  }

  if (command.delta === null) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-command-pending',
      message: 'Cannot apply a pending aggregate frontend command',
    });
  }
  const delta = command.delta;
  const commandBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(AggregateFrontendJournalCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'aggregate-frontend-command-json-encode-failed',
      prefix: 'Failed to encode aggregate frontend command bytes',
    }),
  );

  const resourceRows = [...delta.inserted, ...delta.updated];
  for (const resource of resourceRows) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-command-resource-invalid',
        prefix: `Failed to decode frontend resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }
  for (const removedRef of delta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: removedRef.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          id: makeAbbreviationIdSchema(model.abbreviation),
          modelName: Schema.Literal(model.modelName),
        }),
      ),
    )(removedRef, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-command-ref-invalid',
        prefix: `Failed to decode deleted frontend ref ${removedRef.modelName}.${removedRef.id}`,
      }),
    );
  }

  return yield* makeTx({
    db,
    program: Effect.fn('applyAggregateFrontendCommand.transaction')(function* ({
      tx,
    }) {
      const metadata = tx
        .select()
        .from(sessionMetadataDrizzleSchema)
        .where(eq(sessionMetadataDrizzleSchema.sessionId, sessionId))
        .get();
      if (metadata === undefined) {
        return yield* new ZerospinError({
          code: 'session-metadata-missing',
          message: 'Session metadata must exist before command delivery',
        });
      }
      if ('frontendIndex' in command) {
        if (command.frontendIndex === metadata.frontendIndex) {
          return 'duplicate';
        }
        if (command.frontendIndex !== metadata.frontendIndex + 1) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-command-index-gap',
            message:
              'Finalized aggregate frontend command is not the next frontend index',
            extra: {
              currentFrontendIndex: metadata.frontendIndex,
              receivedFrontendIndex: command.frontendIndex,
            },
          });
        }
        if (command.aggregateIndex <= metadata.aggregateIndex) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-command-source-index-conflict',
            message:
              'Finalized aggregate frontend command does not advance the aggregate source index',
            extra: {
              currentAggregateIndex: metadata.aggregateIndex,
              receivedAggregateIndex: command.aggregateIndex,
            },
          });
        }
      } else {
        if (command.pushIndex === metadata.pushIndex) {
          const retainedCommand = tx
            .select()
            .from(sessionCommandJournalDrizzleSchema)
            .where(eq(sessionCommandJournalDrizzleSchema.id, command.id))
            .get();
          if (retainedCommand?.command === commandBytes) {
            return 'duplicate';
          }
          return yield* new ZerospinError({
            code: 'aggregate-frontend-pushed-command-conflicting-duplicate',
            message: 'Equal push indexes contain different retained bytes',
            extra: { pushIndex: command.pushIndex },
          });
        }
        if (command.pushIndex !== metadata.pushIndex + 1) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-pushed-command-index-gap',
            message:
              'Pushed aggregate frontend command is not the next push index',
            extra: {
              currentPushIndex: metadata.pushIndex,
              receivedPushIndex: command.pushIndex,
            },
          });
        }
      }

      yield* Effect.sync(() => {
        tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
      });

      const activeCommands = tx
        .select()
        .from(sessionCommandJournalDrizzleSchema)
        .all()
        .sort((left, right) => {
          if (left.pushIndex !== null && right.pushIndex !== null) {
            return left.pushIndex - right.pushIndex;
          }
          if (left.pushIndex !== null) return -1;
          if (right.pushIndex !== null) return 1;
          return (left.sessionIndex ?? 0) - (right.sessionIndex ?? 0);
        });

      if ('frontendIndex' in command || command.failedAt !== null) {
        for (const activeCommand of [...activeCommands].reverse()) {
          const mutationRow = tx
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                activeCommand.id,
              ),
            )
            .get();
          if (mutationRow === undefined) continue;
          const encodedMutations = yield* Schema.decodeEffect(
            Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
          )(mutationRow.mutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-decode-failed',
              prefix: 'Failed to decode optimistic session mutations',
            }),
          );
          for (const encodedMutation of [...encodedMutations].reverse()) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: encodedMutation.modelName,
              recordKind: 'frontend models',
            });
            const decodedMutation = yield* decodeAppliedMutation({
              mutation: encodedMutation,
              model,
            });
            yield* applyMutationInverseTx({ tx, mutation: decodedMutation });
          }
        }
      }

      if ('frontendIndex' in command) {
        for (const resource of resourceRows) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: resource.modelName,
            recordKind: 'frontend models',
          });
          upsertHelper({ table: model.drizzleSchema, tx, values: resource });
        }
        for (const removedRef of delta.deleted) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: removedRef.modelName,
            recordKind: 'frontend models',
          });
          tx.delete(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, removedRef.id))
            .run();
        }
        if ('pushIndex' in command && command.pushIndex !== null) {
          const existing = activeCommands.find(
            activeCommand => activeCommand.id === command.id,
          );
          if (existing === undefined) {
            tx.insert(sessionCommandJournalDrizzleSchema)
              .values({
                id: command.id,
                commandName: command.commandName,
                payload: command.payload,
                systemName: command.systemName,
                contractVersion: command.contractVersion,
                aggregateId: command.aggregateId,
                aggregateName: command.aggregateName,
                frontendName: command.frontendName,
                userId: command.userId,
                sessionId: command.sessionId,
                sessionIndex: null,
                pushIndex: command.pushIndex,
                command: commandBytes,
              })
              .run();
          } else {
            tx.update(sessionCommandJournalDrizzleSchema)
              .set({
                pushIndex: command.pushIndex,
                command: commandBytes,
              })
              .where(eq(sessionCommandJournalDrizzleSchema.id, command.id))
              .run();
          }
          tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                command.id,
              ),
            )
            .run();
          tx.insert(sessionResolvedPushDrizzleSchema)
            .values({ sessionId, pushIndex: command.pushIndex })
            .run();
        }
      } else {
        const existing = activeCommands.find(
          activeCommand => activeCommand.id === command.id,
        );
        if (command.failedAt !== null) {
          if (existing === undefined) {
            tx.insert(sessionCommandJournalDrizzleSchema)
              .values({
                id: command.id,
                commandName: command.commandName,
                payload: command.payload,
                systemName: command.systemName,
                contractVersion: command.contractVersion,
                aggregateId: command.aggregateId,
                aggregateName: command.aggregateName,
                frontendName: command.frontendName,
                userId: command.userId,
                sessionId: command.sessionId,
                sessionIndex: null,
                pushIndex: command.pushIndex,
                command: commandBytes,
              })
              .run();
          } else {
            tx.update(sessionCommandJournalDrizzleSchema)
              .set({
                pushIndex: command.pushIndex,
                command: commandBytes,
              })
              .where(eq(sessionCommandJournalDrizzleSchema.id, command.id))
              .run();
          }
          tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                command.id,
              ),
            )
            .run();
        } else if (existing !== undefined) {
          tx.update(sessionCommandJournalDrizzleSchema)
            .set({
              pushIndex: command.pushIndex,
              command: commandBytes,
            })
            .where(eq(sessionCommandJournalDrizzleSchema.id, command.id))
            .run();
        } else {
          tx.insert(sessionCommandJournalDrizzleSchema)
            .values({
              id: command.id,
              commandName: command.commandName,
              payload: command.payload,
              systemName: command.systemName,
              contractVersion: command.contractVersion,
              aggregateId: command.aggregateId,
              aggregateName: command.aggregateName,
              frontendName: command.frontendName,
              userId: command.userId,
              sessionId: command.sessionId,
              sessionIndex: null,
              pushIndex: command.pushIndex,
              command: commandBytes,
            })
            .run();

          const nextEncodedMutations = [];
          for (const encodedMutation of delta.mutations) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: encodedMutation.modelName,
              recordKind: 'frontend models',
            });
            const decodedMutation = yield* decodeAppliedMutation({
              mutation: encodedMutation,
              model,
            });
            const nextAppliedMutation = yield* applyAggregateFrontendMutationTx(
              {
                tx,
                mutation: decodedMutation,
                commandId: command.id,
                mutationIndex: encodedMutation.mutationIndex,
                appliedAt: encodedMutation.appliedAt,
              },
            );
            nextEncodedMutations.push(
              yield* encodeAppliedMutation({ mutation: nextAppliedMutation }),
            );
          }
          for (const resource of resourceRows) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: resource.modelName,
              recordKind: 'frontend models',
            });
            upsertHelper({ table: model.drizzleSchema, tx, values: resource });
          }
          for (const removedRef of delta.deleted) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: removedRef.modelName,
              recordKind: 'frontend models',
            });
            tx.delete(model.drizzleSchema)
              .where(eq(model.drizzleSchema.id, removedRef.id))
              .run();
          }
          const encodedNextMutations = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
          )(nextEncodedMutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-encode-failed',
              prefix: 'Failed to encode optimistic session mutations',
            }),
          );
          tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
            .values({
              commandId: command.id,
              mutations: encodedNextMutations,
            })
            .run();
        }
      }

      if ('frontendIndex' in command || command.failedAt !== null) {
        const commandsToReplay = tx
          .select()
          .from(sessionCommandJournalDrizzleSchema)
          .all()
          .sort((left, right) => {
            if (left.pushIndex !== null && right.pushIndex !== null) {
              return left.pushIndex - right.pushIndex;
            }
            if (left.pushIndex !== null) return -1;
            if (right.pushIndex !== null) return 1;
            return (left.sessionIndex ?? 0) - (right.sessionIndex ?? 0);
          });
        for (const activeCommand of commandsToReplay) {
          const mutationRow = tx
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                activeCommand.id,
              ),
            )
            .get();
          if (mutationRow === undefined) continue;
          const encodedMutations = yield* Schema.decodeEffect(
            Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
          )(mutationRow.mutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-decode-failed',
              prefix: 'Failed to decode optimistic session mutations',
            }),
          );
          const nextEncodedMutations = [];
          for (const encodedMutation of encodedMutations) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: encodedMutation.modelName,
              recordKind: 'frontend models',
            });
            const decodedMutation = yield* decodeAppliedMutation({
              mutation: encodedMutation,
              model,
            });
            const nextAppliedMutation = yield* applyAggregateFrontendMutationTx(
              {
                tx,
                mutation: decodedMutation,
                commandId: encodedMutation.commandId,
                mutationIndex: encodedMutation.mutationIndex,
                appliedAt: encodedMutation.appliedAt,
              },
            );
            nextEncodedMutations.push(
              yield* encodeAppliedMutation({ mutation: nextAppliedMutation }),
            );
          }
          const encodedNextMutations = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
          )(nextEncodedMutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-encode-failed',
              prefix: 'Failed to encode optimistic session mutations',
            }),
          );
          tx.update(sessionOptimisticAppliedMutationDrizzleSchema)
            .set({ mutations: encodedNextMutations })
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                activeCommand.id,
              ),
            )
            .run();
        }
      }

      tx.update(sessionMetadataDrizzleSchema)
        .set({
          aggregateIndex:
            'frontendIndex' in command
              ? command.aggregateIndex
              : metadata.aggregateIndex,
          frontendIndex:
            'frontendIndex' in command
              ? command.frontendIndex
              : metadata.frontendIndex,
          pushIndex:
            'frontendIndex' in command ? metadata.pushIndex : command.pushIndex,
        })
        .where(eq(sessionMetadataDrizzleSchema.sessionId, sessionId))
        .run();

      return 'applied';
    }),
  });
});
