import { AggregateTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateVersionRepoDbConfig } from '../../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import type { IExecutedCommandDelivery } from '../../AggregateVersionRepo/types.js';
import { readAggregateChainOutput } from '../../asyncOperations/readOperationOutput.js';
import { validateForwardedCommand } from '../../forwardedCommands.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

/** Retain the original command result and owned outputs in one transaction. */
export const receiveOriginalResults = makeTx(
  'AggregateChain.receiveOriginalResults',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  rows: readonly Extract<IExecutedCommandDelivery, { kind: 'command' }>[],
) {
  const tables = aggregateChainDbConfig.schema;
  for (const delivery of rows) {
    yield* validateForwardedCommand(delivery.command);
    const decoded =
      yield* aggregateVersionRepoDbConfig.tables.executedCommandOutbox
        .decodeRow(delivery.command)
        .pipe(
          mapParseError({
            code: 'original-result-invalid',
            prefix: 'Invalid original command result',
          }),
        );
    const command = yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateTerminalCommandSchema),
    )(decoded).pipe(
      mapParseError({
        code: 'original-result-invalid',
        prefix: 'Invalid original result disposition',
      }),
    );
    const admitted = tx
      .select()
      .from(tables.commands)
      .where(eq(tables.commands.aggregateIndex, command.aggregateIndex))
      .get();
    if (
      admitted === undefined ||
      admitted.originalExecutionVersion !== decoded.executionVersion ||
      delivery.executedIndex !== decoded.executedIndex
    ) {
      return yield* makeZerospinError('original-result-association-invalid');
    }
    const saved = yield* aggregateChainDbConfig.tables.commands
      .decodeRow(admitted)
      .pipe(
        mapParseError({
          code: 'admitted-command-invalid',
          prefix: 'Invalid retained admission',
        }),
      );
    for (const field of [
      'id',
      'commandName',
      'payload',
      'contractVersion',
      'aggregateId',
      'aggregateName',
      'systemName',
      'aggregateVersion',
      'nodeId',
      'actorName',
      'actorVersion',
      'claims',
      'sessionName',
      'nodeIndex',
      'admission',
    ] as const) {
      if (!isEqual(saved[field], decoded[field])) {
        return yield* makeZerospinError('original-result-command-conflict');
      }
    }
    if (
      command.execution.status !== 'succeeded' &&
      delivery.operations.length !== 0
    ) {
      return yield* makeZerospinError('original-result-rejected-output');
    }
    const result = yield* aggregateChainDbConfig.tables.results
      .encodeRow({
        aggregateIndex: command.aggregateIndex,
        executedIndex: decoded.executedIndex,
        executionVersion: decoded.executionVersion,
        execution: command.execution,
        dispositionHash: command.dispositionHash,
      })
      .pipe(
        mapParseError({
          code: 'original-result-invalid',
          prefix: 'Invalid retained disposition',
        }),
      );
    const outputs: (
      | typeof tables.modelOperations.$inferSelect
      | typeof tables.asyncOperations.$inferSelect
    )[] = [];
    for (const [ordinal, row] of delivery.operations.entries()) {
      if (
        row.executedIndex !== decoded.executedIndex ||
        row.commandId !== command.id ||
        row.operationIndex !== ordinal
      ) {
        return yield* makeZerospinError('original-output-association-invalid');
      }
      if ('asyncContractName' in row) {
        const output = yield* aggregateChainDbConfig.tables.asyncOperations
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'original-output-invalid',
              prefix: 'Invalid async output',
            }),
          );
        outputs.push(
          yield* aggregateChainDbConfig.tables.asyncOperations
            .encodeRow({ ...output, aggregateIndex: command.aggregateIndex })
            .pipe(
              mapParseError({
                code: 'original-output-invalid',
                prefix: 'Invalid retained async output',
              }),
            ),
        );
      } else {
        const output =
          yield* aggregateVersionRepoDbConfig.tables.modelOperations
            .decodeRow(row)
            .pipe(
              mapParseError({
                code: 'original-output-invalid',
                prefix: 'Invalid model output',
              }),
            );
        outputs.push(
          yield* aggregateChainDbConfig.tables.modelOperations
            .encodeRow({ ...output, aggregateIndex: command.aggregateIndex })
            .pipe(
              mapParseError({
                code: 'original-output-invalid',
                prefix: 'Invalid retained model output',
              }),
            ),
        );
      }
    }
    const existing = tx
      .select()
      .from(tables.results)
      .where(eq(tables.results.aggregateIndex, command.aggregateIndex))
      .get();
    if (existing !== undefined) {
      const existingOutputs = readAggregateChainOutput(tx, command.id);
      if (!isEqual(existing, result) || !isEqual(existingOutputs, outputs)) {
        return yield* makeZerospinError('original-result-conflict');
      }
      continue;
    }
    tx.insert(tables.results).values(result).run();
    for (const output of outputs) {
      if ('asyncContractName' in output) {
        tx.insert(tables.asyncOperations).values(output).run();
      } else {
        tx.insert(tables.modelOperations).values(output).run();
      }
    }
  }
});
