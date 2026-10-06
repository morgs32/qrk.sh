import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IAggregateStagedCommand } from '../AggregateNode/types.ts';
import { EncodedAppliedOperationSchema } from '../contracts/encodeAppliedOperation.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type { ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import { decodeNodeResource } from '../Node/decodeNodeResource.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateBrowserCommandSchema } from './AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import { applyOperationInverseTx } from './applyAggregateBrowserCommand/applyOperationInverseTx/applyOperationInverseTx.ts';
import { decodeAppliedOperation } from './applyAggregateBrowserCommand/decodeAppliedOperation/decodeAppliedOperation.ts';
import {
  replayPendingCommandsTx,
  type IAggregateSessionReplayRequirements,
} from './replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';
import { StagingResultSchema } from './StagingResultSchema.ts';
import type {
  IAggregateBrowserCommand,
  IAggregateSessionDefinition,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

export type IAggregateTabCommand =
  | IAggregateStagedCommand
  | IAggregateBrowserCommand;

/** Import one occurrence over the authoritative base, then replay surviving optimism. */
export const importAggregateCommandTx = Effect.fn('importAggregateCommandTx')(
  function* (props: {
    tx: ITx;
    definition: IAggregateSessionDefinition;
    sessionId: ISessionId;
    command: IAggregateTabCommand;
  }) {
    const { tx, definition, sessionId, command } = props;
    const { commands, optimisticAppliedOperations, sessionMetadata } =
      sessionRepoDbConfig.schema;
    const metadata = tx
      .select()
      .from(sessionMetadata)
      .where(eq(sessionMetadata.sessionId, sessionId))
      .get();
    if (metadata === undefined) {
      return yield* makeZerospinError('session-metadata-missing');
    }
    const terminal = 'executedIndex' in command;
    const rows = tx
      .select()
      .from(commands)
      .orderBy(
        sql`${commands.nodeIndex} IS NULL`,
        commands.nodeIndex,
        commands.sessionIndex,
      )
      .all();
    let local = terminal
      ? rows.find(row => row.executedIndex === command.executedIndex)
      : rows.find(
          row =>
            row.nodeId === command.nodeId &&
            row.nodeIndex === command.nodeIndex,
        );
    if (terminal) {
      yield* Schema.encodeUnknownEffect(AggregateBrowserCommandSchema)(
        command,
      ).pipe(
        mapParseError({
          code: 'aggregate-session-command-invalid',
          prefix: 'Invalid aggregate command',
        }),
      );
      const retained =
        local === undefined
          ? undefined
          : yield* sessionRepoDbConfig.tables.commands.decodeRow(local);
      if (retained !== undefined) {
        if (
          retained.id !== command.id ||
          retained.commandName !== command.commandName ||
          retained.aggregateIndex !== command.aggregateIndex ||
          retained.executedHash !== command.executedHash ||
          !isEqual(
            JSON.parse(JSON.stringify(retained.actorDelta)),
            JSON.parse(JSON.stringify(command.delta)),
          ) ||
          !isEqual(
            JSON.parse(JSON.stringify(retained.admission)),
            JSON.parse(JSON.stringify(command.admission)),
          ) ||
          !isEqual(
            JSON.parse(JSON.stringify(retained.execution)),
            JSON.parse(JSON.stringify(command.execution)),
          )
        ) {
          return yield* makeZerospinError('aggregate-session-outcome-conflict');
        }
        return 'duplicate' as const;
      }
      if (
        command.executedIndex === metadata.executedIndex &&
        command.executedHash !== metadata.executedHash
      ) {
        return yield* makeZerospinError(
          'aggregate-session-checkpoint-conflict',
        );
      }
      if (
        command.executedIndex > metadata.executedIndex &&
        (command.executedIndex !== metadata.executedIndex + 1 ||
          command.aggregateIndex < metadata.aggregateIndex)
      ) {
        return yield* makeZerospinError('aggregate-session-command-index-gap');
      }
      local = rows.find(
        row => row.id === command.id && row.executedIndex === null,
      );
    } else {
      if (
        command.actorName !== definition.actorName ||
        command.actorVersion !== definition.actorVersion ||
        command.aggregateName !== definition.aggregateName ||
        command.sessionName !== definition.sessionName
      ) {
        return yield* makeZerospinError('pending-command-actor-mismatch');
      }
      local ??= rows.find(
        row => row.id === command.id && row.executedIndex === null,
      );
      local ??= rows.find(row => row.id === command.id && row.payload !== null);
      if (local !== undefined && local.executedIndex !== null) {
        if (
          local.commandName !== command.commandName ||
          local.payload !== command.payload ||
          local.contractVersion !== command.contractVersion ||
          (local.nodeIndex !== null && local.nodeIndex !== command.nodeIndex) ||
          (local.nodeId !== null && local.nodeId !== command.nodeId)
        ) {
          return yield* makeZerospinError('session-staged-input-conflict');
        }
        tx.update(commands)
          .set({
            nodeId: command.nodeId,
            nodeIndex: command.nodeIndex,
            admissionIndex: command.admissionIndex,
          })
          .where(eq(commands.sessionIndex, local.sessionIndex))
          .run();
        return 'duplicate' as const;
      }
    }
    const sessionIndex = local?.sessionIndex ?? metadata.nextSessionIndex;
    if (
      local === undefined &&
      (!Number.isSafeInteger(sessionIndex) ||
        sessionIndex < 1 ||
        sessionIndex >= Number.MAX_SAFE_INTEGER)
    ) {
      return yield* makeZerospinError({
        code: 'session-index-invalid',
        message: 'The durable next session index is invalid',
        extra: { sessionIndex: String(sessionIndex) },
      });
    }
    const nextSessionIndex =
      local === undefined ? sessionIndex + 1 : metadata.nextSessionIndex;
    tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
    for (const row of [...rows].reverse()) {
      const inverse = tx
        .select()
        .from(optimisticAppliedOperations)
        .where(eq(optimisticAppliedOperations.sessionIndex, row.sessionIndex))
        .get();
      if (inverse === undefined) continue;
      const operations = yield* Schema.decodeEffect(
        Schema.fromJsonString(Schema.Array(EncodedAppliedOperationSchema)),
      )(inverse.operations);
      for (const operation of [...operations].reverse()) {
        const model = yield* getByKeyOrThrow({
          record: definition.models,
          key: operation.modelName,
          recordKind: 'session models',
        });
        yield* applyOperationInverseTx({
          tx,
          operation: yield* decodeAppliedOperation({ operation, model }),
        });
      }
    }
    tx.delete(optimisticAppliedOperations).run();
    if (terminal) {
      const values = yield* sessionRepoDbConfig.tables.commands.encodeRow({
        sessionIndex,
        id: command.id,
        commandName: command.commandName,
        payload: local?.payload ?? null,
        contractVersion: local?.contractVersion ?? null,
        aggregateId: local?.aggregateId ?? null,
        aggregateName: local?.aggregateName ?? null,
        actorName: local?.actorName ?? null,
        actorVersion: local?.actorVersion ?? null,
        sessionName: local?.sessionName ?? null,
        claims:
          local?.claims === null || local?.claims === undefined
            ? null
            : JSON.parse(local.claims),
        sessionId: local?.sessionId ?? null,
        nodeId: local?.nodeId ?? null,
        nodeIndex: local?.nodeIndex ?? null,
        admissionIndex: local?.admissionIndex ?? null,
        staging:
          local?.staging === null || local?.staging === undefined
            ? null
            : yield* Schema.decodeEffect(
                Schema.fromJsonString(StagingResultSchema),
              )(local.staging),
        admission: command.admission,
        execution: command.execution,
        actorDelta: command.delta,
        aggregateIndex: command.aggregateIndex,
        executedIndex: command.executedIndex,
        executedHash: command.executedHash,
      });
      if (local === undefined) {
        tx.insert(commands).values(values).run();
      } else {
        tx.update(commands)
          .set(values)
          .where(eq(commands.sessionIndex, local.sessionIndex))
          .run();
      }
      if (command.executedIndex > metadata.executedIndex) {
        for (const resource of command.delta.upserted) {
          const model = yield* getByKeyOrThrow({
            record: definition.models,
            key: resource.modelName,
            recordKind: 'session models',
          });
          const resourceRow = decodeNodeResource(
            resource,
            model.spec.propertiesShape,
          );
          yield* Schema.decodeUnknownEffect(model.table.codec)(resourceRow, {
            onExcessProperty: 'error',
          });
          upsertHelper({
            tx,
            table: model.drizzleSchema,
            values: resourceRow,
          });
        }
        for (const ref of command.delta.deleted) {
          const model = yield* getByKeyOrThrow({
            record: definition.models,
            key: ref.modelName,
            recordKind: 'session models',
          });
          tx.delete(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, ref.id))
            .run();
        }
        tx.update(sessionMetadata)
          .set({
            aggregateIndex: command.aggregateIndex,
            executedIndex: command.executedIndex,
            executedHash: command.executedHash,
          })
          .where(eq(sessionMetadata.sessionId, sessionId))
          .run();
      }
    } else {
      const staging = yield* Schema.decodeUnknownEffect(StagingResultSchema)(
        command.staging,
      );
      const values = yield* sessionRepoDbConfig.tables.commands.encodeRow({
        ...command,
        staging,
        sessionIndex,
        sessionId: local?.sessionId ?? null,
        admission: null,
        execution: null,
        actorDelta: null,
        aggregateIndex: null,
        executedIndex: null,
        executedHash: null,
      });
      if (local === undefined) {
        tx.insert(commands).values(values).run();
      } else {
        tx.update(commands)
          .set(values)
          .where(eq(commands.sessionIndex, local.sessionIndex))
          .run();
      }
    }
    if (local === undefined) {
      tx.update(sessionMetadata)
        .set({ nextSessionIndex })
        .where(eq(sessionMetadata.sessionId, sessionId))
        .run();
    }
    yield* replayPendingCommandsTx({ tx, definition });
    return 'applied' as const;
  },
);

const importPageTx = makeTx('importAggregateNodeCommands')(function* (
  tx: ITx,
  props: {
    definition: IAggregateSessionDefinition;
    sessionId: ISessionId;
    commands: readonly IAggregateTabCommand[];
    throughChangeIndex?: number;
  },
) {
  for (const command of props.commands) {
    yield* importAggregateCommandTx({
      tx,
      definition: props.definition,
      sessionId: props.sessionId,
      command,
    });
  }
  const { sessionMetadata } = sessionRepoDbConfig.schema;
  if (props.throughChangeIndex !== undefined) {
    const metadata = tx
      .select()
      .from(sessionMetadata)
      .where(eq(sessionMetadata.sessionId, props.sessionId))
      .get();
    if (
      metadata === undefined ||
      props.throughChangeIndex < metadata.changeIndex
    ) {
      return yield* makeZerospinError('session-change-index-regression');
    }
    tx.update(sessionMetadata)
      .set({ changeIndex: props.throughChangeIndex })
      .where(eq(sessionMetadata.sessionId, props.sessionId))
      .run();
  }
  const metadata = tx
    .select()
    .from(sessionMetadata)
    .where(eq(sessionMetadata.sessionId, props.sessionId))
    .get();
  if (metadata === undefined) {
    return yield* makeZerospinError('session-metadata-missing');
  }
  return metadata;
});

type IImportAggregateNodeCommandsProps<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  db: ISessionDrizzleDb;
  definition: DEFINITION;
  sessionId: ISessionId;
  commands: readonly IAggregateTabCommand[];
  throughChangeIndex?: number;
};

export function importAggregateNodeCommands<
  DEFINITION extends IAggregateSessionDefinition,
>(
  props: IImportAggregateNodeCommandsProps<DEFINITION>,
): Effect.Effect<
  Effect.Success<ReturnType<typeof importPageTx>>,
  IAnyError,
  IAggregateSessionReplayRequirements<DEFINITION>
>;
export function importAggregateNodeCommands(
  props: IImportAggregateNodeCommandsProps,
) {
  const { db, ...input } = props;
  return importPageTx(db, input).pipe(
    Effect.mapError(error =>
      isZerospinError(error)
        ? error
        : makeZerospinError({
            code: 'session-command-import-invalid',
            message: String(error),
          }),
    ),
  );
}
