/*
 * Direct aggregate server-block application.
 *
 * 1. Validate the exact next frontend index.
 * 2. Rewind local optimistic overlays before authoritative resource changes.
 * 3. Persist complete pending/terminal command truth from the server block.
 * 4. Replay stored encoded optimistic mutations without rerunning contracts.
 * 5. Preserve each command's authored contract-version provenance.
 */
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
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
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateFrontendBlockSchema } from './AggregateFrontendBlockSchema.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type {
  IAggregateFrontendBlock,
  IAggregateFrontendSyncState,
  ISessionDrizzleDb,
} from './types.ts';

export const applyAggregateFrontendBlock = Effect.fn(
  'applyAggregateFrontendBlock',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  models: InferFrontendModels<FRONTEND>;
  frontendBlock: IAggregateFrontendBlock;
  aggregateId: IAggregateFrontendSyncState['aggregateId'];
  userId: IAggregateFrontendSyncState['userId'];
  currentFrontendIndex: number;
}): Effect.fn.Return<void, IAnyError> {
  const {
    aggregateId,
    userId,
    currentFrontendIndex,
    db,
    frontend,
    frontendBlock,
    models,
  } = props;

  yield* Schema.encode(AggregateFrontendBlockSchema)(frontendBlock, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-frontend-block-encode-failed',
      prefix: 'Failed to encode frontend block',
    }),
  );

  if (
    frontendBlock.frontendName !== frontend.frontendName ||
    frontendBlock.frontendIndex !== currentFrontendIndex + 1
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-block-target-mismatch',
      message: 'Frontend block does not match the bound aggregate target',
      extra: {
        expectedFrontendName: frontend.frontendName,
        expectedFrontendIndex: currentFrontendIndex + 1,
        actualFrontendName: frontendBlock.frontendName,
        actualFrontendIndex: frontendBlock.frontendIndex,
      },
    });
  }
  const resourceRows = [
    ...frontendBlock.delta.inserted,
    ...frontendBlock.delta.updated,
  ];
  for (const resource of resourceRows) {
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
        code: 'aggregate-frontend-block-resource-invalid',
        prefix: `Failed to decode frontend resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }
  for (const removedRef of frontendBlock.delta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: removedRef.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.validate(
      Schema.Struct({
        id: makeAbbreviationIdSchema(model.abbreviation),
        modelName: Schema.Literal(model.modelName),
      }),
    )(removedRef, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-block-ref-invalid',
        prefix: `Failed to decode deleted frontend ref ${removedRef.modelName}.${removedRef.id}`,
      }),
    );
  }
  for (const command of frontendBlock.pendingPushedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-block-pending-command-target-mismatch',
        message: `Pending command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }
  for (const command of frontendBlock.executedPushedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-block-executed-command-target-mismatch',
        message: `Executed command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }
  for (const command of frontendBlock.failedPushedCommands) {
    if (
      command.aggregateId !== aggregateId ||
      command.userId !== userId ||
      command.aggregateName !== frontend.aggregateName ||
      command.frontendName !== frontend.frontendName ||
      command.systemName !== frontend.systemName
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-block-failed-command-target-mismatch',
        message: `Failed command "${command.id}" does not match the bound aggregate target`,
      });
    }
  }

  yield* makeTx({
    db,
    program: Effect.fn('applyAggregateFrontendBlock.server')(function* ({
      tx,
    }) {
      yield* Effect.sync(() => {
        tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
      });

      // 1 — rewind all local overlays in reverse application order.
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
      const accountedPushedCommandIds = new Set(
        [
          ...frontendBlock.pendingPushedCommands,
          ...frontendBlock.executedPushedCommands,
          ...frontendBlock.failedPushedCommands,
        ].map(command => command.id),
      );
      const unaccountedPushedCommand = pushedCommandsToRewind.find(
        command => !accountedPushedCommandIds.has(command.id),
      );
      if (unaccountedPushedCommand !== undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-block-pushed-command-unaccounted',
          message: `Frontend block does not account for pushed command "${unaccountedPushedCommand.id}"`,
        });
      }
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
          yield* applyMutationInverseTx({ tx, mutation: decodedMutation });
        }
      }

      // 2 — apply the authoritative resource delta.
      for (const resource of resourceRows) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: resource.modelName,
          recordKind: 'frontend models',
        });
        upsertHelper({ table: model.drizzleSchema, tx, values: resource });
      }
      for (const removedRef of frontendBlock.delta.deleted) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: removedRef.modelName,
          recordKind: 'frontend models',
        });
        tx.delete(model.drizzleSchema)
          .where(eq(model.drizzleSchema.id, removedRef.id))
          .run();
      }

      // 3 — promote the complete post-block pending membership.
      for (const command of frontendBlock.pendingPushedCommands) {
        const localFailure = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .where(eq(sessionFailedCommandDrizzleSchema.id, command.id))
          .get();
        if (localFailure !== undefined) {
          continue;
        }
        upsertHelper({
          table: sessionPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
      }

      // 4 — persist full terminal authority and remove local intent rows.
      for (const command of frontendBlock.executedPushedCommands) {
        const localFailure = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .where(eq(sessionFailedCommandDrizzleSchema.id, command.id))
          .get();
        if (localFailure === undefined) {
          upsertHelper({
            table: sessionExecutedPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
        tx.delete(sessionPushedCommandDrizzleSchema)
          .where(eq(sessionPushedCommandDrizzleSchema.id, command.id))
          .run();
        tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .run();
      }
      for (const command of frontendBlock.failedPushedCommands) {
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
        tx.delete(sessionPushedCommandDrizzleSchema)
          .where(eq(sessionPushedCommandDrizzleSchema.id, command.id))
          .run();
        upsertHelper({
          table: sessionFailedCommandDrizzleSchema,
          tx,
          values: command,
        });
        tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .run();
      }

      // 5 — replay stored encoded operations and recompute their inverses.
      const pushedCommandsToReplay = tx
        .select()
        .from(sessionPushedCommandDrizzleSchema)
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
        const encodedNextMutations = yield* Schema.encode(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
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
              command.id,
            ),
          )
          .run();
      }
    }),
  });
});
