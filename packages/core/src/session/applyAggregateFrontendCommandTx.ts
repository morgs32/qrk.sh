import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Context, Effect, Schema } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import { applyMutationInverseTx } from '../contracts/applyMutationInverseTx.ts';
import { AggregateChainedCommandSchema } from '../contracts/CommandSchema.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionMetadataDrizzleSchema } from './sessionRepoTables.ts';
import type {
  IAggregateFrontendFinalizedCommand,
  IFrontendDelta,
  ISessionId,
} from './types.ts';

export class Db extends Context.Service<Db, IDb>()(
  'core/src/session/applyAggregateFrontendCommand/Db',
) {
  static readonly Tx = Context.Service<
    'core/src/session/applyAggregateFrontendCommand/Db.Tx',
    ITx
  >('core/src/session/applyAggregateFrontendCommand/Db.Tx');
}

/** Atomically reconcile finalized input with the optimistic journal and advance frontend progress. */
export const applyAggregateFrontendCommandTx = makeTx(
  'applyAggregateFrontendCommandTx',
  Db,
)(function* (props: {
  sessionId: ISessionId;
  command: IAggregateFrontendFinalizedCommand;
  models: IAnyModels;
  resourceRows: readonly IEncodedResourceShape[];
  delta: IFrontendDelta;
  resolution:
    | NonNullable<IAggregateFrontendFinalizedCommand['resolution']>['command']
    | null;
}): Effect.fn.Return<
  'applied' | 'duplicate',
  IAnyError,
  typeof Db.Tx.Identifier
> {
  const { sessionId, command, models, resourceRows, delta, resolution } = props;

  const tx = yield* Db.Tx;
  // 3 — The session metadata decides exact duplicates and requires the next
  // frontend position before any rows are changed.
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
  if (command.userIndex <= metadata.userIndex) return 'duplicate';
  if (command.userIndex !== metadata.userIndex + 1) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-command-index-gap',
      message: 'Frontend output is not the next frontend position',
    });
  }
  if (command.aggregateIndex < metadata.aggregateIndex) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-command-watermark-regression',
      message: 'Frontend output regresses the consumed aggregate position',
    });
  }
  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });

  const activeCommands = tx
    .select()
    .from(sessionCommandJournalDrizzleSchema)
    // Renewed session indexes cannot order retained older occurrences.
    .orderBy(
      sql`${sessionCommandJournalDrizzleSchema.pushIndex} IS NULL`,
      sessionCommandJournalDrizzleSchema.pushIndex,
      sql`rowid`,
    )
    .all();

  // 4 — Each finalized output first undoes every optimistic
  // mutation newest-first to expose the last authoritative base.
  {
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

  // 5 — Apply the authoritative delta and resolve its originating command.
  {
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
    if (resolution !== null) {
      const resolutionBytes = yield* Schema.encodeEffect(
        Schema.fromJsonString(AggregateChainedCommandSchema),
      )(resolution).pipe(
        mapParseError({
          code: 'aggregate-resolution-encode-failed',
          prefix: 'Invalid originating resolution',
        }),
      );
      tx.update(sessionCommandJournalDrizzleSchema)
        .set({ command: resolutionBytes, pushIndex: resolution.aggregateIndex })
        .where(eq(sessionCommandJournalDrizzleSchema.id, resolution.id))
        .run();
      tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
        .where(
          eq(
            sessionOptimisticAppliedMutationDrizzleSchema.commandId,
            resolution.id,
          ),
        )
        .run();
    }
  }

  // 6 — Reapply retained optimistic commands in journal order and replace
  // each stored inverse list with the effects produced over the new base.
  {
    const commandsToReplay = tx
      .select()
      .from(sessionCommandJournalDrizzleSchema)
      .orderBy(
        sql`${sessionCommandJournalDrizzleSchema.pushIndex} IS NULL`,
        sessionCommandJournalDrizzleSchema.pushIndex,
        sql`rowid`,
      )
      .all();
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

  // 7 — Advance frontend output order and its consumed aggregate watermark.
  tx.update(sessionMetadataDrizzleSchema)
    .set({
      aggregateIndex: command.aggregateIndex,
      userIndex: command.userIndex,
    })
    .where(eq(sessionMetadataDrizzleSchema.sessionId, sessionId))
    .run();

  // 8 — Reaching here means resource, journal, optimism, and frontier rows
  // committed together; duplicate paths returned before mutation.
  return 'applied';
});
