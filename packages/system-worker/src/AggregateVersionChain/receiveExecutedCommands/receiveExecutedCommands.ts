import { AggregateTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import type { InferDecodedRow } from '@zerospin/shapes';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import type { IExecutedCommandDelivery } from '../../AggregateVersionRepo/types.js';
import { readAggregateVersionChainOutput } from '../../asyncOperations/readOperationOutput.js';
import { validateForwardedCommand } from '../../forwardedCommands.js';
import { decodeOwnedOperation } from '../../ownedOperations.js';
import { aggregateVersionChainDbConfig } from '../aggregateVersionChainDbConfig.js';

const readAggregateCommand = (
  row: InferDecodedRow<
    typeof aggregateVersionChainDbConfig.tables.aggregateCommands.shape
  >,
) => {
  const { aggregateVersion, ...fields } = row;
  return Schema.decodeUnknownEffect(
    Schema.toType(AggregateTerminalCommandSchema),
  )({
    ...fields,
    ...(aggregateVersion === null ? {} : { aggregateVersion }),
  });
};

/** Retain the entire publication page atomically; identical retries do not append. */
export const receiveExecutedCommands = Effect.fn(
  'AggregateVersionChain.receiveExecutedCommands',
)(function* (props: {
  db: IDb<typeof aggregateVersionChainDbConfig>;
  key: { aggregateId: string; aggregateName: string; aggregateVersion: string };
  rows: readonly IExecutedCommandDelivery[];
}) {
  const { db, key, rows } = props;
  yield* makeTx('AggregateVersionChain.retainExecutedResults')(function* (
    tx: ITx<typeof aggregateVersionChainDbConfig>,
  ) {
    const { aggregateCommands, modelOperations: operations } =
      aggregateVersionChainDbConfig.schema;
    for (const delivery of rows) {
      yield* validateForwardedCommand(delivery.command);
      if (
        !Number.isSafeInteger(delivery.executedIndex) ||
        delivery.executedIndex < 1
      ) {
        return yield* makeZerospinError('finalized-result-position-invalid');
      }
      const existingCommand = tx
        .select()
        .from(aggregateCommands)
        .where(eq(aggregateCommands.executedIndex, delivery.executedIndex))
        .get();
      const aggregateTip = tx
        .select()
        .from(aggregateCommands)
        .orderBy(desc(aggregateCommands.executedIndex))
        .limit(1)
        .get();
      const exists = existingCommand !== undefined;
      if (
        !exists &&
        delivery.executedIndex !== (aggregateTip?.executedIndex ?? 0) + 1
      ) {
        return yield* makeZerospinError({
          code: 'finalized-result-gap',
          message: 'Finalized owner history must be contiguous',
        });
      }

      const { lastDeliveryFailure: __, ...row } = delivery.command;
      const decoded =
        yield* aggregateVersionChainDbConfig.tables.aggregateCommands
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'executed-command-invalid',
              prefix: 'Invalid aggregate row',
            }),
          );
      const command = yield* readAggregateCommand(decoded).pipe(
        mapParseError({
          code: 'executed-command-invalid',
          prefix: 'Invalid aggregate output',
        }),
      );
      if (
        row.executedIndex !== delivery.executedIndex ||
        row.executionVersion !== key.aggregateVersion ||
        command.aggregateId !== key.aggregateId ||
        command.aggregateName !== key.aggregateName
      ) {
        return yield* makeZerospinError('finalized-command-target-mismatch');
      }
      if (
        delivery.operations.length > 0 &&
        decoded.execution.status !== 'succeeded'
      ) {
        return yield* makeZerospinError('finalized-operation-invalid');
      }
      for (const [ordinal, operation] of delivery.operations.entries()) {
        if (!('asyncContractName' in operation)) {
          yield* decodeOwnedOperation(operation);
        }
        if ('asyncContractName' in operation) {
          yield* aggregateVersionChainDbConfig.tables.asyncOperations
            .decodeRow(operation)
            .pipe(
              mapParseError({
                code: 'finalized-operation-invalid',
                prefix: 'Invalid async output',
              }),
            );
        } else {
          yield* aggregateVersionRepoDbConfig.tables.modelOperations
            .decodeRow(operation)
            .pipe(
              mapParseError({
                code: 'finalized-operation-invalid',
                prefix: 'Invalid model output',
              }),
            );
        }
        if (
          operation.executedIndex !== row.executedIndex ||
          operation.commandId !== row.id ||
          operation.operationIndex !== ordinal
        ) {
          return yield* makeZerospinError('finalized-operation-invalid');
        }
      }
      if (exists) {
        if (
          existingCommand === undefined ||
          !isEqual(
            yield* aggregateVersionChainDbConfig.tables.aggregateCommands.decodeRow(
              existingCommand,
            ),
            decoded,
          )
        ) {
          return yield* makeZerospinError('finalized-command-conflict');
        }
        const retained = readAggregateVersionChainOutput(tx, row.id);
        if (!isEqual(retained, delivery.operations)) {
          return yield* makeZerospinError('finalized-operation-conflict');
        }
        continue;
      }
      const previous =
        aggregateTip === undefined
          ? genesisDispositionHash()
          : (yield* aggregateVersionChainDbConfig.tables.aggregateCommands
              .decodeRow(aggregateTip)
              .pipe(Effect.flatMap(readAggregateCommand))).dispositionHash;
      if (
        command.aggregateIndex !== (aggregateTip?.aggregateIndex ?? 0) + 1 ||
        command.dispositionHash !==
          advanceDispositionHash({
            failure:
              command.admission.status === 'failed'
                ? command.admission.failure
                : command.execution.status === 'failed'
                  ? command.execution.failure
                  : null,
            previousDispositionHash: previous,
            aggregateIndex: command.aggregateIndex,
            commandId: command.id,
            disposition:
              command.execution.status === 'succeeded' ? 'success' : 'failure',
          })
      ) {
        return yield* makeZerospinError('finalized-command-hash-mismatch');
      }
      tx.insert(aggregateCommands).values(row).run();
      for (const operation of delivery.operations) {
        if ('asyncContractName' in operation) {
          tx.insert(aggregateVersionChainDbConfig.schema.asyncOperations)
            .values(operation)
            .run();
        } else {
          tx.insert(operations).values(operation).run();
        }
      }
    }
  })(db).pipe(
    Effect.mapError(cause =>
      isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
        ? cause
        : makeZerospinError({
            code: 'finalized-result-publication-failed',
            message: 'Failed to retain executed result page',
            cause: prettyUnknownFailure(cause),
          }),
    ),
  );
});
