import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import type { IEncodedCommand } from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  AggregateFrontendJournalCommandSchema,
  AggregateFrontendPushedCommandSchema,
  AggregateFrontendSyncStateSchema,
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
  IAggregateFrontendPushedCommand,
  IAggregateFrontendSyncState,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

export const applyAggregateFrontendState = Effect.fn(
  'applyAggregateFrontendState',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  sessionId: ISessionId;
  models: InferFrontendModels<FRONTEND>;
  frontendState: IAggregateFrontendSyncState;
  pushedCommands: readonly IEncodedCommand<IAggregateFrontendPushedCommand>[];
  aggregateId: IAggregateFrontendSyncState['aggregateId'];
  userId: IAggregateFrontendSyncState['userId'];
  systemId: IAggregateFrontendSyncState['systemId'];
}): Effect.fn.Return<void, IAnyError> {
  const {
    aggregateId,
    db,
    frontend,
    frontendState,
    models,
    pushedCommands,
    sessionId,
    systemId,
    userId,
  } = props;

  yield* Schema.encodeEffect(AggregateFrontendSyncStateSchema)(frontendState, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-encode-failed',
      prefix: 'Failed to encode aggregate frontend state',
    }),
  );

  if (
    frontendState.aggregateId !== aggregateId ||
    frontendState.userId !== userId ||
    frontendState.systemId !== systemId ||
    frontendState.aggregateName !== frontend.aggregateName ||
    frontendState.frontendName !== frontend.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-target-mismatch',
      message: 'Aggregate frontend state does not match the bound target',
    });
  }

  if (
    new Set(frontendState.resolvedPushIndexes).size !==
    frontendState.resolvedPushIndexes.length
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-resolved-push-duplicate',
      message:
        'Aggregate frontend state contains duplicate resolved push indexes',
    });
  }

  const sortedPushedCommands = [...pushedCommands].sort(
    (left, right) => left.pushIndex - right.pushIndex,
  );
  for (const [index, command] of sortedPushedCommands.entries()) {
    yield* Schema.encodeUnknownEffect(AggregateFrontendPushedCommandSchema)(
      command,
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-pushed-command-encode-failed',
        prefix: 'Failed to encode aggregate frontend pushed recovery command',
      }),
    );
    if (
      command.delta === null ||
      command.pushIndex !== index + 1 ||
      command.aggregateId !== aggregateId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.userId !== userId
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-pushed-catchup-invalid',
        message:
          'Aggregate frontend pushed recovery must be complete, contiguous, terminal, and exact-target',
      });
    }
  }
  if (sortedPushedCommands.length !== frontendState.pushIndex) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-pushed-catchup-incomplete',
      message: 'Aggregate frontend pushed recovery did not reach the state tip',
    });
  }

  for (const resource of frontendState.resources) {
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
        code: 'aggregate-frontend-state-resource-invalid',
        prefix: `Failed to decode aggregate frontend state resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }

  yield* makeTx({
    db,
    program: Effect.fn('applyAggregateFrontendState.replace')(function* ({
      tx,
    }) {
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
      const optimisticAppliedMutations = tx
        .select()
        .from(sessionOptimisticAppliedMutationDrizzleSchema)
        .all();

      const resolvedPushIndexes = new Set(frontendState.resolvedPushIndexes);
      for (const pushedCommand of sortedPushedCommands) {
        if (pushedCommand.delta === null) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-pushed-catchup-invalid',
            message:
              'Aggregate frontend pushed recovery must contain terminal commands',
          });
        }
        const existingIndex = activeCommands.findIndex(
          row => row.id === pushedCommand.id,
        );
        const commandBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(AggregateFrontendJournalCommandSchema),
        )(pushedCommand).pipe(
          mapParseError({
            code: 'aggregate-frontend-command-json-encode-failed',
            prefix: 'Failed to encode pushed recovery command bytes',
          }),
        );

        if (existingIndex >= 0) {
          const existing = activeCommands[existingIndex];
          if (existing !== undefined) {
            tx.update(sessionCommandJournalDrizzleSchema)
              .set({
                pushIndex: pushedCommand.pushIndex,
                command: commandBytes,
              })
              .where(eq(sessionCommandJournalDrizzleSchema.id, existing.id))
              .run();
            activeCommands.splice(existingIndex, 1, {
              ...existing,
              pushIndex: pushedCommand.pushIndex,
              command: commandBytes,
            });
          }
        }

        if (
          resolvedPushIndexes.has(pushedCommand.pushIndex) ||
          pushedCommand.failedAt !== null
        ) {
          continue;
        }

        if (existingIndex < 0) {
          const row = {
            id: pushedCommand.id,
            commandName: pushedCommand.commandName,
            payload: pushedCommand.payload,
            systemName: pushedCommand.systemName,
            contractVersion: pushedCommand.contractVersion,
            aggregateId: pushedCommand.aggregateId,
            aggregateName: pushedCommand.aggregateName,
            frontendName: pushedCommand.frontendName,
            userId: pushedCommand.userId,
            sessionId: pushedCommand.sessionId,
            sessionIndex: null,
            pushIndex: pushedCommand.pushIndex,
            command: commandBytes,
          };
          tx.insert(sessionCommandJournalDrizzleSchema).values(row).run();
          activeCommands.push(row);
        }

        const mutations = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
        )(pushedCommand.delta.mutations).pipe(
          mapParseError({
            code: 'session-optimistic-mutations-encode-failed',
            prefix: 'Failed to encode pushed recovery mutations',
          }),
        );
        const mutationIndex = optimisticAppliedMutations.findIndex(
          row => row.commandId === pushedCommand.id,
        );
        if (mutationIndex >= 0) {
          optimisticAppliedMutations.splice(mutationIndex, 1, {
            commandId: pushedCommand.id,
            mutations,
          });
        } else {
          optimisticAppliedMutations.push({
            commandId: pushedCommand.id,
            mutations,
          });
        }
      }
      tx.delete(sessionOptimisticAppliedMutationDrizzleSchema).run();
      const metadata = tx
        .select()
        .from(sessionMetadataDrizzleSchema)
        .where(eq(sessionMetadataDrizzleSchema.sessionId, sessionId))
        .get();

      for (const model of Object.values(models)) {
        tx.delete(model.drizzleSchema).run();
      }
      for (const resource of frontendState.resources) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: resource.modelName,
          recordKind: 'frontend models',
        });
        tx.insert(model.drizzleSchema).values(resource).run();
      }
      tx.delete(sessionResolvedPushDrizzleSchema)
        .where(eq(sessionResolvedPushDrizzleSchema.sessionId, sessionId))
        .run();
      for (const pushIndex of frontendState.resolvedPushIndexes) {
        tx.insert(sessionResolvedPushDrizzleSchema)
          .values({ sessionId, pushIndex })
          .run();
      }
      tx.insert(sessionMetadataDrizzleSchema)
        .values({
          sessionId,
          nextSessionIndex: metadata?.nextSessionIndex ?? 1,
          aggregateIndex: frontendState.aggregateIndex,
          frontendIndex: frontendState.frontendIndex,
          pushIndex: frontendState.pushIndex,
          systemVersion: frontendState.systemVersion,
        })
        .onConflictDoUpdate({
          target: sessionMetadataDrizzleSchema.sessionId,
          set: {
            aggregateIndex: frontendState.aggregateIndex,
            frontendIndex: frontendState.frontendIndex,
            pushIndex: frontendState.pushIndex,
            systemVersion: frontendState.systemVersion,
          },
        })
        .run();

      for (const activeCommand of activeCommands) {
        if (
          activeCommand.pushIndex !== null &&
          resolvedPushIndexes.has(activeCommand.pushIndex)
        ) {
          continue;
        }
        const mutationRow = optimisticAppliedMutations.find(
          row => row.commandId === activeCommand.id,
        );
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
          const nextAppliedMutation = yield* applyAggregateFrontendMutationTx({
            tx,
            mutation: decodedMutation,
            commandId: encodedMutation.commandId,
            mutationIndex: encodedMutation.mutationIndex,
            appliedAt: encodedMutation.appliedAt,
          });
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
        tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
          .values({
            commandId: activeCommand.id,
            mutations: encodedNextMutations,
          })
          .run();
      }
    }),
  });
});
