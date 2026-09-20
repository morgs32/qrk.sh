import { mapParseError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Context, Effect, Schema } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, ITx } from '../drizzle/types.ts';
import type { IAnyModels } from '../models/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import { AggregateSelectedCommandSchema } from './AggregateSelectedCommandSchema.ts';
import { sessionMetadataDrizzleSchema } from './sessionRepoTables.ts';
import type { IAggregateFrontendSnapshot, ISessionId } from './types.ts';

export class Db extends Context.Service<Db, IDb>()(
  'core/src/session/applyAggregateFrontendSnapshot/Db',
) {
  static readonly Tx = Context.Service<
    'core/src/session/applyAggregateFrontendSnapshot/Db.Tx',
    ITx
  >('core/src/session/applyAggregateFrontendSnapshot/Db.Tx');
}

/** Replace authoritative frontend resources and replay surviving optimism in one transaction. */
export const applyAggregateFrontendSnapshotTx = makeTx(
  'applyAggregateFrontendSnapshotTx',
  Db,
)(function* (props: {
  snapshot: IAggregateFrontendSnapshot;
  sessionId: ISessionId;
  models: IAnyModels;
}) {
  const { snapshot, sessionId, models } = props;

  const tx = yield* Db.Tx;
  yield* Effect.sync(() => {
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  });
  const activeCommands = tx
    .select()
    .from(sessionCommandJournalDrizzleSchema)
    // Session indexes restart on acquisition; SQLite row order preserves
    // unadmitted occurrence order across those execution identities.
    .orderBy(
      sql`${sessionCommandJournalDrizzleSchema.pushIndex} IS NULL`,
      sessionCommandJournalDrizzleSchema.pushIndex,
      sql`rowid`,
    )
    .all();
  const optimisticAppliedMutations = tx
    .select()
    .from(sessionOptimisticAppliedMutationDrizzleSchema)
    .all();

  const selectedCommandIds = new Set(
    snapshot.selectedCommands.map(command => command.id),
  );
  for (const command of snapshot.selectedCommands) {
    const encoded = yield* Schema.encodeEffect(
      Schema.fromJsonString(AggregateSelectedCommandSchema),
    )(command).pipe(
      mapParseError({
        code: 'aggregate-selected-command-encode-failed',
        prefix: 'Invalid snapshot selected command',
      }),
    );
    tx.update(sessionCommandJournalDrizzleSchema)
      .set({ command: encoded, pushIndex: command.aggregateIndex })
      .where(eq(sessionCommandJournalDrizzleSchema.id, command.id))
      .run();
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
  for (const resource of snapshot.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'frontend models',
    });
    tx.insert(model.drizzleSchema).values(resource).run();
  }
  tx.insert(sessionMetadataDrizzleSchema)
    .values({
      sessionId,
      nextSessionIndex: metadata?.nextSessionIndex ?? 1,
      aggregateIndex: snapshot.aggregateIndex,
      selectionIndex: snapshot.selectionIndex,
      selectionHash: snapshot.selectionHash,
      pushIndex: metadata?.pushIndex ?? 0,
    })
    .onConflictDoUpdate({
      target: sessionMetadataDrizzleSchema.sessionId,
      set: {
        aggregateIndex: snapshot.aggregateIndex,
        selectionIndex: snapshot.selectionIndex,
        selectionHash: snapshot.selectionHash,
        pushIndex: metadata?.pushIndex ?? 0,
      },
    })
    .run();

  for (const activeCommand of activeCommands) {
    if (selectedCommandIds.has(activeCommand.id)) continue;
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
});
