import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { FrontendReplicaStateSchema } from './FrontendBlockSchema.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type {
  IFrontendReplicaState,
  ISessionDrizzleDb,
  ISessionSchema,
} from './types.ts';

/*
 * A worker replica replacement is already fully materialized. It replaces
 * resources, every server lifecycle table, the local journal, and encoded
 * optimistic mutation/inverse rows without executing application contracts.
 * Replica and command systemVersion values remain snapshot provenance within
 * an otherwise exact generation/frontend target.
 */
export const applyFrontendReplicaState = Effect.fn('applyFrontendReplicaState')(
  function* <FRONTEND extends IFrontendController>(props: {
    frontend: FRONTEND;
    accountId: IFrontendReplicaState['accountId'];
    actorId: IFrontendReplicaState['actorId'];
    systemId: IFrontendReplicaState['systemId'];
    generationId: string;
    systemVersion: string;
    systemWorkerName: string;
    db: ISessionDrizzleDb<
      InferFrontendModels<FRONTEND>,
      IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
    >;
    schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
    models: InferFrontendModels<FRONTEND>;
    frontendReplicaState: IFrontendReplicaState;
  }): Effect.fn.Return<void, IAnyError> {
    const {
      accountId,
      actorId,
      db,
      frontend,
      frontendReplicaState,
      generationId,
      models,
      systemId,
      systemVersion,
      systemWorkerName,
    } = props;

    yield* Schema.encode(FrontendReplicaStateSchema)(frontendReplicaState, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'frontend-replica-state-encode-failed',
        prefix: 'Failed to encode frontend replica state',
      }),
    );

    if (
      frontendReplicaState.frontendVersion !== frontend.version ||
      frontendReplicaState.accountId !== accountId ||
      frontendReplicaState.actorId !== actorId ||
      frontendReplicaState.systemId !== systemId ||
      frontendReplicaState.generationId !== generationId ||
      frontendReplicaState.systemWorkerName !== systemWorkerName ||
      frontendReplicaState.accountName !== frontend.accountName ||
      frontendReplicaState.actorName !== frontend.actorName ||
      frontendReplicaState.frontendName !== frontend.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'frontend-replica-state-target-mismatch',
        message:
          'Frontend replica state does not match the bound account target',
        extra: {
          expectedFrontendVersion: frontend.version,
          expectedAccountId: accountId,
          expectedActorId: actorId,
          expectedSystemId: systemId,
          expectedGenerationId: generationId,
          expectedSystemWorkerName: systemWorkerName,
          expectedAccountName: frontend.accountName,
          expectedActorName: frontend.actorName,
          expectedFrontendName: frontend.frontendName,
          actualFrontendVersion: frontendReplicaState.frontendVersion,
          actualAccountId: frontendReplicaState.accountId,
          actualActorId: frontendReplicaState.actorId,
          actualSystemId: frontendReplicaState.systemId,
          actualGenerationId: frontendReplicaState.generationId,
          actualSystemWorkerName: frontendReplicaState.systemWorkerName,
          actualAccountName: frontendReplicaState.accountName,
          actualActorName: frontendReplicaState.actorName,
          actualFrontendName: frontendReplicaState.frontendName,
          authenticatedSystemVersion: systemVersion,
          replicaSystemVersion: frontendReplicaState.systemVersion,
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
          code: 'frontend-replica-state-resource-invalid',
          prefix: `Failed to decode frontend replica state resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }

    for (const command of frontendReplicaState.pushedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-state-pushed-command-target-mismatch',
          message: `Pushed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }

    for (const command of frontendReplicaState.stagedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-state-staged-command-target-mismatch',
          message: `Staged command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }

    for (const command of frontendReplicaState.failedStagedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-state-failed-staged-command-target-mismatch',
          message: `Failed staged command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }

    for (const command of frontendReplicaState.executedPushedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-state-executed-command-target-mismatch',
          message: `Executed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }

    for (const command of frontendReplicaState.failedPushedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-state-failed-command-target-mismatch',
          message: `Failed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }

    for (const optimisticRow of frontendReplicaState.optimisticAppliedMutations) {
      for (const mutation of optimisticRow.mutations) {
        if (mutation.commandId !== optimisticRow.commandId) {
          return yield* new ZerospinError({
            code: 'frontend-replica-state-mutation-command-mismatch',
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
      program: Effect.fn('applyFrontendReplicaState.replaceState')(function* ({
        tx,
      }) {
        yield* Effect.sync(() => {
          tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
        });

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
              accountCursor: null,
              accountIndex: null,
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
      }),
    });
  },
);
