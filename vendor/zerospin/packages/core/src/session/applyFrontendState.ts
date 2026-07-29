import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyFrontendMutationTx } from '../contracts/applyFrontendMutationTx.ts';
import { applyMutationInverseTx } from '../contracts/applyMutationInverseTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { FrontendSyncStateSchema } from './FrontendBlockSchema.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type {
  IFrontendSyncState,
  ISessionDrizzleDb,
  ISessionSchema,
} from './types.ts';

/*
 * 1. Reject a snapshot for any other compiled frontend or authenticated target.
 * 2. Validate every resource and command owner before deleting one local row.
 *    A command's systemVersion remains historical provenance because one
 *    compatible generation archive can span multiple system versions.
 * 3. Rewind the existing optimistic overlay inside the replacement transaction.
 * 4. Replace authoritative resources and lifecycle rows, then replay only the
 *    still-live encoded optimistic mutations without rerunning contract code.
 */
export const applyFrontendState = Effect.fn('applyFrontendState')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  frontend: FRONTEND;
  frontendVersion: string;
  accountId: IFrontendSyncState['accountId'];
  actorId: IFrontendSyncState['actorId'];
  systemId: IFrontendSyncState['systemId'];
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
  models: InferFrontendModels<FRONTEND>;
  frontendState: IFrontendSyncState;
}): Effect.fn.Return<void, IAnyError> {
  const {
    accountId,
    actorId,
    db,
    frontend,
    frontendState,
    frontendVersion,
    generationId,
    models,
    systemId,
    systemVersion,
    systemWorkerName,
  } = props;

  yield* Schema.encode(FrontendSyncStateSchema)(frontendState, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'frontend-state-encode-failed',
      prefix: 'Failed to encode frontend state',
    }),
  );

  if (
    frontend.version !== frontendVersion ||
    frontendState.accountId !== accountId ||
    frontendState.actorId !== actorId ||
    frontendState.systemId !== systemId ||
    frontendState.generationId !== generationId ||
    frontendState.systemVersion !== systemVersion ||
    frontendState.systemWorkerName !== systemWorkerName ||
    frontendState.accountName !== frontend.accountName ||
    frontendState.actorName !== frontend.actorName ||
    frontendState.frontendName !== frontend.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'frontend-state-target-mismatch',
      message: 'Frontend state does not match the bound account target',
      extra: {
        expectedFrontendVersion: frontendVersion,
        compiledFrontendVersion: frontend.version,
        expectedAccountId: accountId,
        expectedActorId: actorId,
        expectedSystemId: systemId,
        expectedGenerationId: generationId,
        expectedSystemVersion: systemVersion,
        expectedSystemWorkerName: systemWorkerName,
        expectedAccountName: frontend.accountName,
        expectedActorName: frontend.actorName,
        expectedFrontendName: frontend.frontendName,
        actualAccountId: frontendState.accountId,
        actualActorId: frontendState.actorId,
        actualSystemId: frontendState.systemId,
        actualGenerationId: frontendState.generationId,
        actualSystemVersion: frontendState.systemVersion,
        actualSystemWorkerName: frontendState.systemWorkerName,
        actualAccountName: frontendState.accountName,
        actualActorName: frontendState.actorName,
        actualFrontendName: frontendState.frontendName,
      },
    });
  }

  for (const resource of frontendState.resources) {
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
        code: 'frontend-state-resource-invalid',
        prefix: `Failed to decode frontend state resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }

  for (const command of frontendState.pushedCommands) {
    if (
      command.accountId !== accountId ||
      command.actorId !== actorId ||
      command.accountName !== frontend.accountName ||
      command.actorName !== frontend.actorName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'frontend-state-pushed-command-target-mismatch',
        message: `Pushed command "${command.id}" does not match the bound account target`,
      });
    }
    yield* getByKeyOrThrow({
      record: frontend.contracts,
      key: command.commandName,
      recordKind: 'frontend contracts',
    });
  }

  for (const command of frontendState.executedPushedCommands) {
    if (
      command.accountId !== accountId ||
      command.actorId !== actorId ||
      command.accountName !== frontend.accountName ||
      command.actorName !== frontend.actorName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'frontend-state-executed-command-target-mismatch',
        message: `Executed command "${command.id}" does not match the bound account target`,
      });
    }
    yield* getByKeyOrThrow({
      record: frontend.contracts,
      key: command.commandName,
      recordKind: 'frontend contracts',
    });
  }

  for (const command of frontendState.failedPushedCommands) {
    if (
      command.accountId !== accountId ||
      command.actorId !== actorId ||
      command.accountName !== frontend.accountName ||
      command.actorName !== frontend.actorName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'frontend-state-failed-command-target-mismatch',
        message: `Failed command "${command.id}" does not match the bound account target`,
      });
    }
    yield* getByKeyOrThrow({
      record: frontend.contracts,
      key: command.commandName,
      recordKind: 'frontend contracts',
    });
  }

  yield* makeTx({
    db,
    program: Effect.fn('applyFrontendState.replaceState')(function* ({ tx }) {
      yield* Effect.sync(() => {
        tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
      });

      // 1 — remove the optimistic overlay in exact reverse command/mutation order.
      const stagedCommandsToRewind = tx
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .orderBy(desc(sessionStagedCommandDrizzleSchema.stagedCursor))
        .all();
      const pushedCommandsToRewind = tx
        .select()
        .from(sessionPushedCommandDrizzleSchema)
        .orderBy(desc(sessionPushedCommandDrizzleSchema.pushedCursor))
        .all();
      for (const command of [
        ...stagedCommandsToRewind,
        ...pushedCommandsToRewind,
      ]) {
        const optimisticRow = tx
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .get();
        if (optimisticRow === undefined) {
          continue;
        }

        const encodedMutations = yield* Schema.decode(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
        )(optimisticRow.mutations).pipe(
          mapParseError({
            code: 'session-optimistic-mutations-decode-failed',
            prefix: 'Failed to decode optimistic session mutations',
          }),
        );
        const decodedMutations = [];
        for (const encodedMutation of encodedMutations) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: encodedMutation.modelName,
            recordKind: 'frontend models',
          });
          decodedMutations.push(
            yield* decodeAppliedMutation({
              mutation: encodedMutation,
              model,
            }),
          );
        }
        decodedMutations.sort(
          (left, right) => right.mutationIndex - left.mutationIndex,
        );
        for (const decodedMutation of decodedMutations) {
          yield* applyMutationInverseTx({
            tx,
            mutation: decodedMutation,
          });
        }
      }

      // 2 — atomically replace every server-owned materialized row.
      const localFailedCommands = tx
        .select()
        .from(sessionFailedCommandDrizzleSchema)
        .where(isNull(sessionFailedCommandDrizzleSchema.accountCursor))
        .all();
      for (const model of Object.values(models)) {
        tx.delete(model.drizzleSchema).run();
      }
      tx.delete(sessionPushedCommandDrizzleSchema).run();
      tx.delete(sessionExecutedPushedCommandDrizzleSchema).run();
      tx.delete(sessionFailedCommandDrizzleSchema).run();

      for (const resource of frontendState.resources) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: resource.modelName,
          recordKind: 'frontend models',
        });
        tx.insert(model.drizzleSchema).values(resource).run();
      }
      for (const command of frontendState.pushedCommands) {
        upsertHelper({
          table: sessionPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
      }
      for (const command of frontendState.executedPushedCommands) {
        upsertHelper({
          table: sessionExecutedPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
      }
      for (const command of frontendState.failedPushedCommands) {
        upsertHelper({
          table: sessionFailedCommandDrizzleSchema,
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

      // 3 — discard optimistic rows whose command is no longer live.
      const optimisticRows = tx
        .select()
        .from(sessionOptimisticAppliedMutationDrizzleSchema)
        .all();
      for (const optimisticRow of optimisticRows) {
        const stagedCommand = tx
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .where(
            eq(sessionStagedCommandDrizzleSchema.id, optimisticRow.commandId),
          )
          .get();
        const pushedCommand = tx
          .select()
          .from(sessionPushedCommandDrizzleSchema)
          .where(
            eq(sessionPushedCommandDrizzleSchema.id, optimisticRow.commandId),
          )
          .get();
        if (stagedCommand === undefined && pushedCommand === undefined) {
          tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                optimisticRow.commandId,
              ),
            )
            .run();
        }
      }

      // 4 — reapply still-unrepresented pushed overlays before staged overlays.
      const pushedCommandsToReplay = tx
        .select()
        .from(sessionPushedCommandDrizzleSchema)
        .where(
          frontendState.lastRebasedPushedCursor === null
            ? sql`1 = 1`
            : gt(
                sessionPushedCommandDrizzleSchema.pushedCursor,
                frontendState.lastRebasedPushedCursor,
              ),
        )
        .orderBy(sessionPushedCommandDrizzleSchema.pushedCursor)
        .all();
      const stagedCommandsToReplay = tx
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
        .all();
      for (const command of [
        ...pushedCommandsToReplay,
        ...stagedCommandsToReplay,
      ]) {
        const optimisticRow = tx
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .get();
        if (optimisticRow === undefined) {
          continue;
        }

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
          const nextAppliedMutation = yield* applyFrontendMutationTx({
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
        const encodedOptimisticMutations = yield* Schema.encode(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
        )(nextEncodedMutations).pipe(
          mapParseError({
            code: 'session-optimistic-mutations-encode-failed',
            prefix: 'Failed to encode optimistic session mutations',
          }),
        );
        tx.update(sessionOptimisticAppliedMutationDrizzleSchema)
          .set({ mutations: encodedOptimisticMutations })
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .run();
      }
    }),
  });
});
