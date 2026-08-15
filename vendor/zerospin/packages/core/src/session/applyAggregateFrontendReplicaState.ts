import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateFrontendReplicaStateSchema } from './AggregateFrontendBlockSchema.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type {
  IAggregateFrontendReplicaState,
  ISessionDrizzleDb,
  ISessionSchema,
} from './types.ts';

/*
 * A worker replica replacement is already fully materialized. It replaces
 * resources, every server lifecycle table, the local journal, and encoded
 * optimistic mutation/inverse rows without executing application contracts.
 * The replica System version remains observed metadata while the complete
 * lock key guards the exact local materialization.
 */
export const applyAggregateFrontendReplicaState = Effect.fn(
  'applyAggregateFrontendReplicaState',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  frontend: FRONTEND;
  aggregateId: IAggregateFrontendReplicaState['aggregateId'];
  userId: IAggregateFrontendReplicaState['userId'];
  systemId: IAggregateFrontendReplicaState['systemId'];
  aggregateFrontendLockKey: string;
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
  models: InferFrontendModels<FRONTEND>;
  frontendReplicaState: IAggregateFrontendReplicaState;
}): Effect.fn.Return<void, IAnyError> {
  const {
    aggregateId,
    userId,
    db,
    frontend,
    frontendReplicaState,
    models,
    systemId,
    aggregateFrontendLockKey,
  } = props;

  yield* Schema.encode(AggregateFrontendReplicaStateSchema)(
    frontendReplicaState,
    {
      onExcessProperty: 'error',
    },
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-replica-state-encode-failed',
      prefix: 'Failed to encode frontend replica state',
    }),
  );

  if (
    frontendReplicaState.aggregateId !== aggregateId ||
    frontendReplicaState.userId !== userId ||
    frontendReplicaState.systemId !== systemId ||
    frontendReplicaState.aggregateName !== frontend.aggregateName ||
    frontendReplicaState.frontendName !== frontend.frontendName ||
    frontendReplicaState.aggregateFrontendLockKey !== aggregateFrontendLockKey
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-replica-state-target-mismatch',
      message:
        'Frontend replica state does not match the bound aggregate target',
      extra: {
        expectedAggregateId: aggregateId,
        expectedUserId: userId,
        expectedSystemId: systemId,
        expectedAggregateName: frontend.aggregateName,
        expectedFrontendName: frontend.frontendName,
        expectedAggregateFrontendLockKey: aggregateFrontendLockKey,
        actualAggregateId: frontendReplicaState.aggregateId,
        actualUserId: frontendReplicaState.userId,
        actualSystemId: frontendReplicaState.systemId,
        actualAggregateName: frontendReplicaState.aggregateName,
        actualFrontendName: frontendReplicaState.frontendName,
        actualAggregateFrontendLockKey:
          frontendReplicaState.aggregateFrontendLockKey,
      },
    });
  }

  for (const resource of frontendReplicaState.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-replica-state-resource-invalid',
        prefix: `Failed to decode frontend replica state resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }

  for (const command of frontendReplicaState.pushedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-replica-state-pushed-command-target-mismatch',
        message: `Pushed command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }

  for (const command of frontendReplicaState.stagedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-replica-state-staged-command-target-mismatch',
        message: `Staged command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }

  for (const command of frontendReplicaState.failedStagedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-replica-state-failed-staged-command-target-mismatch',
        message: `Failed staged command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }

  for (const command of frontendReplicaState.executedPushedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-replica-state-executed-command-target-mismatch',
        message: `Executed command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }

  for (const command of frontendReplicaState.failedPushedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-replica-state-failed-command-target-mismatch',
        message: `Failed command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }

  for (const optimisticRow of frontendReplicaState.optimisticAppliedMutations) {
    for (const mutation of optimisticRow.mutations) {
      if (mutation.commandId !== optimisticRow.commandId) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-replica-state-mutation-command-mismatch',
          message: `Optimistic mutation command "${mutation.commandId}" does not match row "${optimisticRow.commandId}"`,
        });
      }
      yield* getByKeyOrThrow({
        record: models,
        key: mutation.modelName,
        recordKind: 'frontend models',
      });
    }
  }

  yield* makeTx({
    db,
    program: Effect.fn('applyAggregateFrontendReplicaState.replaceState')(
      function* ({ tx }) {
        yield* Effect.sync(() => {
          tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
        });

        const incomingCommandIds = new Set(
          [
            ...frontendReplicaState.stagedCommands,
            ...frontendReplicaState.pushedCommands,
            ...frontendReplicaState.executedPushedCommands,
            ...frontendReplicaState.failedStagedCommands,
            ...frontendReplicaState.failedPushedCommands,
          ].map(command => command.id),
        );
        const localStagedCommands = tx
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
          .all()
          .filter(command => !incomingCommandIds.has(command.id));
        const localPushedCommands = tx
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .orderBy(sessionPushedCommandDrizzleSchema.pushedCursor)
          .all()
          .filter(command => !incomingCommandIds.has(command.id));
        const localFailedCommands = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .orderBy(sessionFailedCommandDrizzleSchema.stagedCursor)
          .all()
          .filter(command => !incomingCommandIds.has(command.id));
        const localOptimisticRows = new Map(
          tx
            .select()
            .from(sessionOptimisticAppliedMutationDrizzleSchema)
            .all()
            .filter(row => !incomingCommandIds.has(row.commandId))
            .map(row => [row.commandId, row]),
        );

        for (const model of Object.values(models)) {
          tx.delete(model.drizzleSchema).run();
        }
        tx.delete(sessionStagedCommandDrizzleSchema).run();
        tx.delete(sessionPushedCommandDrizzleSchema).run();
        tx.delete(sessionExecutedPushedCommandDrizzleSchema).run();
        tx.delete(sessionFailedCommandDrizzleSchema).run();
        tx.delete(sessionOptimisticAppliedMutationDrizzleSchema).run();

        for (const resource of frontendReplicaState.resources) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: resource.modelName,
            recordKind: 'frontend models',
          });
          tx.insert(model.drizzleSchema).values(resource).run();
        }
        for (const command of frontendReplicaState.stagedCommands) {
          upsertHelper({
            table: sessionStagedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaState.pushedCommands) {
          upsertHelper({
            table: sessionPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaState.executedPushedCommands) {
          upsertHelper({
            table: sessionExecutedPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaState.failedPushedCommands) {
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaState.failedStagedCommands) {
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: {
              ...command,
              pushedAt: null,
            },
          });
        }
        for (const optimisticRow of frontendReplicaState.optimisticAppliedMutations) {
          const encodedMutations = yield* Schema.encode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(optimisticRow.mutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-encode-failed',
              prefix: 'Failed to encode optimistic session mutations',
            }),
          );
          tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
            .values({
              commandId: optimisticRow.commandId,
              mutations: encodedMutations,
            })
            .onConflictDoUpdate({
              target: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              set: { mutations: encodedMutations },
            })
            .run();
        }

        for (const command of localStagedCommands) {
          upsertHelper({
            table: sessionStagedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of localPushedCommands) {
          upsertHelper({
            table: sessionPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of localFailedCommands) {
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of [
          ...localPushedCommands,
          ...localStagedCommands,
          ...localFailedCommands,
        ]) {
          const optimisticRow = localOptimisticRows.get(command.id);
          if (optimisticRow === undefined) continue;
          const encodedMutations = yield* Schema.decode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(optimisticRow.mutations).pipe(
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
          const encodedNextMutations = yield* Schema.encode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
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
            .onConflictDoUpdate({
              target: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              set: { mutations: encodedNextMutations },
            })
            .run();
        }
      },
    ),
  });
});
