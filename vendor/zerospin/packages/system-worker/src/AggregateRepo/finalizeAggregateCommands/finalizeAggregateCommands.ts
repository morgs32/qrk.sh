/*
 * System-worker annotation:
 * Finalizes aggregate commands into an AggregateRepo block, stores the
 * pre-publish outbox row transactionally. The AggregateRepo boundary drains
 * the outbox after this Effect commits.
 */

import type { Async } from '@zerospin/core/async/Async';
import {
  EncodedAggregateCommandSchema,
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAggregateCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IFailedAggregateCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAggregateBlockOutboxRecord } from '../../types.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';

import { finalizeCommandsTx } from './finalizeCommandsTx.js';
import { makeAggregateBlockTx } from './makeAggregateBlockTx.js';
import { prepareAggregateCommands } from './prepareAggregateCommands.js';
import { upsertAggregateBlockTx } from './upsertAggregateBlockTx.js';

export const finalizeAggregateCommands = Effect.fn(
  'AggregateRepo.finalizeAggregateCommands',
)(function* (props: {
  generationId: string;
  writeIndex: number;
  aggregateId: string;
  aggregateName: string;
  commands: readonly IEncodedCommand<IAggregateCommand>[];
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<
  Readonly<{
    executedCommands: readonly IEncodedCommand<IExecutedAggregateCommand>[];
    failedCommands: readonly IEncodedCommand<IFailedAggregateCommand>[];
    appliedMutations: readonly IEncodedAppliedMutation[];
    lastAggregateCursor: IEncodedCommand<IExecutedAggregateCommand>['aggregateCursor'];
    aggregateIndex: number;
  }>,
  IAnyError,
  Async | CuidFactory | MonotonicFactory
> {
  const { generationId, writeIndex, aggregateName, commands, db, storage } =
    props;

  if (!Number.isSafeInteger(writeIndex) || writeIndex < 1) {
    return yield* new ZerospinError({
      code: 'aggregate-finalization-write-index-invalid',
      message: `Aggregate finalization writeIndex must be a positive safe integer, received ${writeIndex}`,
    });
  }
  if (commands.length === 0) {
    return yield* new ZerospinError({
      code: 'no-commands-provided',
      message: 'No commands provided',
    });
  }
  if (
    props.aggregateId !== props.key.aggregateId ||
    props.aggregateName !== props.key.aggregateName ||
    props.generationId !== props.key.generationId
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-finalization-target-mismatch',
      message: 'Aggregate finalization does not match its bound AggregateRepo',
    });
  }

  const commandBytesById = new Map<string, string>();
  const retainedOutcomes = new Map<
    string,
    Readonly<{
      command:
        | IEncodedCommand<IExecutedAggregateCommand>
        | IEncodedCommand<IFailedAggregateCommand>;
      appliedMutations: readonly IEncodedAppliedMutation[];
    }>
  >();
  const unseenCommands: IEncodedCommand<IAggregateCommand>[] = [];
  for (const command of commands) {
    const commandBytes = yield* Schema.encode(
      Schema.parseJson(EncodedAggregateCommandSchema),
    )(command).pipe(
      mapParseError({
        code: 'aggregate-command-comparison-encode-failed',
        prefix: `Failed to encode aggregate command ${command.id} for exact comparison`,
      }),
    );
    const repeatedBytes = commandBytesById.get(command.id);
    if (repeatedBytes !== undefined) {
      if (repeatedBytes !== commandBytes) {
        return yield* new ZerospinError({
          code: 'aggregate-command-outcome-conflict',
          message: `Aggregate command ${command.id} appears with conflicting bytes in one request`,
        });
      }
      continue;
    }
    commandBytesById.set(command.id, commandBytes);

    const retained = db
      .select()
      .from(aggregateRepoDrizzleSchemas.aggregateCommandOutcomes)
      .where(
        eq(
          aggregateRepoDrizzleSchemas.aggregateCommandOutcomes.commandId,
          command.id,
        ),
      )
      .get();
    if (retained === undefined) {
      unseenCommands.push(command);
      continue;
    }
    if (retained.commandBytes !== commandBytes) {
      return yield* new ZerospinError({
        code: 'aggregate-command-outcome-conflict',
        message: `Aggregate command ${command.id} conflicts with its retained terminal outcome`,
      });
    }
    const terminalCommand = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Union(
          EncodedExecutedAggregateCommandSchema,
          EncodedFailedAggregateCommandSchema,
        ),
      ),
    )(retained.command).pipe(
      mapParseError({
        code: 'aggregate-command-outcome-decode-failed',
        prefix: `Failed to decode retained aggregate command outcome ${command.id}`,
      }),
    );
    const appliedMutations = yield* Schema.decodeUnknown(
      Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
    )(retained.appliedMutations).pipe(
      mapParseError({
        code: 'aggregate-command-outcome-mutations-decode-failed',
        prefix: `Failed to decode retained aggregate command mutations ${command.id}`,
      }),
    );
    retainedOutcomes.set(command.id, {
      command: terminalCommand,
      appliedMutations,
    });
  }

  if (unseenCommands.length > 0) {
    const preparation = yield* prepareAggregateCommands({
      generationId,
      aggregateName,
      commands: unseenCommands,
      db,
    });
    const createdOutcomes = yield* makeTx({
      db,
      program: Effect.fn('AggregateRepo.finalizeAggregateCommands.transaction')(
        function* ({ tx }) {
          const finalization = yield* finalizeCommandsTx({
            aggregateName,
            preparedCommands: preparation.preparedCommands,
            serviceAlignments: preparation.serviceAlignments,
            storage,
            tx,
          });
          const aggregateBlock = yield* makeAggregateBlockTx({
            writeIndex,
            executedCommands: finalization.encodedExecutedCommands,
            failedCommands: finalization.encodedFailedCommands,
            appliedMutations: finalization.appliedMutations,
            storage,
            tx,
          });
          const aggregateBlockOutboxRecord = {
            ...aggregateBlock,
            failure: null,
            publishedAt: null,
          } satisfies IAggregateBlockOutboxRecord;
          yield* upsertAggregateBlockTx({
            aggregateBlock: aggregateBlockOutboxRecord,
            tx,
          });
          const outcomes: Array<
            Readonly<{
              command:
                | IEncodedCommand<IExecutedAggregateCommand>
                | IEncodedCommand<IFailedAggregateCommand>;
              appliedMutations: readonly IEncodedAppliedMutation[];
            }>
          > = [];
          for (const command of [
            ...finalization.encodedExecutedCommands,
            ...finalization.encodedFailedCommands,
          ]) {
            const commandBytes = commandBytesById.get(command.id);
            if (commandBytes === undefined) {
              return yield* new ZerospinError({
                code: 'aggregate-command-comparison-bytes-missing',
                message: `Aggregate command ${command.id} has no request comparison bytes`,
              });
            }
            const commandMutations = finalization.appliedMutations.filter(
              mutation => mutation.commandId === command.id,
            );
            const encodedTerminalCommand = yield* Schema.encode(
              Schema.parseJson(
                Schema.Union(
                  EncodedExecutedAggregateCommandSchema,
                  EncodedFailedAggregateCommandSchema,
                ),
              ),
            )(command).pipe(
              mapParseError({
                code: 'aggregate-command-outcome-encode-failed',
                prefix: `Failed to encode aggregate command outcome ${command.id}`,
              }),
            );
            const encodedCommandMutations = yield* Schema.encode(
              Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
            )(commandMutations).pipe(
              mapParseError({
                code: 'aggregate-command-outcome-mutations-encode-failed',
                prefix: `Failed to encode aggregate command mutations ${command.id}`,
              }),
            );
            tx.insert(aggregateRepoDrizzleSchemas.aggregateCommandOutcomes)
              .values({
                commandId: command.id,
                commandBytes,
                command: encodedTerminalCommand,
                aggregateCursor: command.aggregateCursor,
                aggregateIndex: command.aggregateIndex,
                appliedMutations: encodedCommandMutations,
                writeIndex,
              })
              .run();
            outcomes.push({ command, appliedMutations: commandMutations });
          }
          return outcomes;
        },
      ),
    });
    for (const outcome of createdOutcomes) {
      retainedOutcomes.set(outcome.command.id, outcome);
    }
  }

  const executedCommands: IEncodedCommand<IExecutedAggregateCommand>[] = [];
  const failedCommands: IEncodedCommand<IFailedAggregateCommand>[] = [];
  const appliedMutations: IEncodedAppliedMutation[] = [];
  let lastAggregateCursor = null;
  let aggregateIndex = 0;
  for (const requestedCommand of commands) {
    const outcome = retainedOutcomes.get(requestedCommand.id);
    if (outcome === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-command-outcome-missing',
        message: `Aggregate command ${requestedCommand.id} has no terminal outcome`,
      });
    }
    if (outcome.command.status === 'executed') {
      executedCommands.push(outcome.command);
    } else {
      failedCommands.push(outcome.command);
    }
    appliedMutations.push(...outcome.appliedMutations);
    if (outcome.command.aggregateIndex > aggregateIndex) {
      lastAggregateCursor = outcome.command.aggregateCursor;
      aggregateIndex = outcome.command.aggregateIndex;
    }
  }
  if (lastAggregateCursor === null) {
    return yield* new ZerospinError({
      code: 'aggregate-finalization-receipt-has-no-position',
      message:
        'Aggregate finalization receipt has no terminal aggregate position',
    });
  }
  return {
    executedCommands,
    failedCommands,
    appliedMutations,
    lastAggregateCursor,
    aggregateIndex,
  };
});
