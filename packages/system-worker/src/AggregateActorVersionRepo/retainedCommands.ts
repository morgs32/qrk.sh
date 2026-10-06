import {
  EncodedAggregateCommandSchema,
  type AggregateTerminalCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateActorVersionRepoDbConfig } from './aggregateActorVersionRepoDbConfig.js';

const tables = aggregateActorVersionRepoDbConfig.schema;

export type IRetainedCommand = Effect.Success<
  ReturnType<typeof aggregateActorVersionRepoDbConfig.tables.commands.decodeRow>
>;

export const commandRowForSource = (
  db: IDb,
  command: {
    id: string;
    aggregateId?: string;
    aggregateName?: string;
  },
) =>
  db
    .select()
    .from(tables.commands)
    .where(
      and(
        eq(tables.commands.aggregateName, command.aggregateName ?? ''),
        eq(tables.commands.aggregateId, command.aggregateId ?? ''),
        eq(tables.commands.id, command.id),
      ),
    )
    .get();

export const decodeRetainedAggregateCommand = Effect.fn(
  'decodeRetainedAggregateCommand',
)(function* (row: IRetainedCommand) {
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(EncodedAggregateCommandSchema),
  )({
    id: row.id,
    commandName: row.commandName,
    contractVersion: row.contractVersion,
    payload: row.payload,
    response: row.response,
    aggregateId: row.aggregateId,
    aggregateName: row.aggregateName,
    systemName: row.systemName,
    actorName: row.actorName,
    actorVersion: row.actorVersion,
    claims: row.claims,
    nodeId: row.nodeId,
    sessionName: row.sessionName,
    nodeIndex: row.nodeIndex,
    ...(row.nodeId === null ? { aggregateVersion: row.aggregateVersion } : {}),
  }).pipe(
    mapParseError({
      code: 'saved-actor-command-invalid',
      prefix: 'Invalid retained actor command',
    }),
  );
});

export const readPendingActorCommands = Effect.fn('readPendingActorCommands')(
  function* (db: IDb, aggregateVersion: string) {
    const pending = db
      .select()
      .from(tables.stagedCommands)
      .orderBy(tables.stagedCommands.stageIndex)
      .all();
    return yield* Effect.forEach(pending, row =>
      Effect.gen(function* () {
        const stage =
          yield* aggregateActorVersionRepoDbConfig.tables.stagedCommands.decodeRow(
            row,
          );
        const saved = db
          .select()
          .from(tables.commands)
          .where(eq(tables.commands.rowId, stage.commandRowId))
          .get();
        if (saved === undefined) {
          return yield* makeZerospinError('saved-actor-command-missing');
        }
        const retained =
          yield* aggregateActorVersionRepoDbConfig.tables.commands.decodeRow(
            saved,
          );
        const { response, ...command } =
          yield* decodeRetainedAggregateCommand(retained);
        if (response != null) {
          return yield* makeZerospinError('public-async-command-forbidden');
        }
        return {
          ...stage,
          ...command,
          aggregateVersion,
          aggregateIndex: retained.aggregateIndex,
          admission: retained.admission,
        };
      }),
    ).pipe(
      Effect.mapError(error =>
        isZerospinError(error)
          ? error
          : makeZerospinError({
              code: 'saved-actor-command-invalid',
              cause: String(error),
            }),
      ),
    );
  },
);

export const commandRowInput = (props: {
  rowId: `row_${string}`;
  command:
    | IEncodedCommand<IAggregateCommand>
    | typeof AggregateTerminalCommandSchema.Type;
  aggregateVersion?: string;
}) => {
  const { rowId, command } = props;
  const aggregate = 'aggregateId' in command;
  return {
    rowId,
    id: command.id,
    commandName: command.commandName,
    contractVersion: command.contractVersion,
    payload: command.payload,
    response: command.response ?? null,
    aggregateId: aggregate ? command.aggregateId : null,
    aggregateName: aggregate ? command.aggregateName : null,
    aggregateVersion: aggregate
      ? 'aggregateVersion' in command
        ? command.aggregateVersion
        : (props.aggregateVersion ?? null)
      : null,
    systemName: aggregate ? command.systemName : null,
    actorName: aggregate ? command.actorName : null,
    actorVersion: aggregate ? command.actorVersion : null,
    claims: aggregate ? command.claims : null,
    nodeId: aggregate ? command.nodeId : null,
    sessionName: aggregate ? command.sessionName : null,
    nodeIndex: aggregate ? command.nodeIndex : null,
    aggregateIndex: 'aggregateIndex' in command ? command.aggregateIndex : null,
    admission: 'admission' in command ? command.admission : null,
    execution: 'execution' in command ? command.execution : null,
    dispositionHash:
      'dispositionHash' in command ? command.dispositionHash : null,
    executedIndex: null,
    executedHash: null,
  };
};
