import { ServiceTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import type { InferDecodedRow } from '@zerospin/schema';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { readServiceVersionChainOutput } from '../../asyncOperations/readOperationOutput.js';
import { validateForwardedCommand } from '../../forwardedCommands.js';
import { decodeOwnedOperation } from '../../ownedOperations.js';
import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import type { IExecutedCommandDelivery } from '../../ServiceVersionRepo/readExecutedCommandsPage.js';
import { serviceVersionRepoDbConfig } from '../../ServiceVersionRepo/serviceVersionRepoDbConfig.js';
import { serviceVersionChainDbConfig } from '../serviceVersionChainDbConfig.js';
type IServiceRow = InferDecodedRow<
  typeof serviceVersionChainDbConfig.tables.commands.shape
>;
type IOperationRow = IExecutedCommandDelivery['operations'][number];
const readServiceCommand = (row: IServiceRow) =>
  Schema.decodeUnknownEffect(Schema.toType(ServiceTerminalCommandSchema))({
    id: row.id,
    commandName: row.commandName,
    payload: row.payload,
    asyncInput: row.asyncInput,
    contractVersion: row.contractVersion,
    serviceName: row.serviceName,
    serviceVersion: row.serviceVersion,
    caller: row.caller,
    admission: row.admission,
    execution: row.execution,
    dispositionHash: row.dispositionHash,
    serviceIndex: row.serviceIndex,
  });
const retainResult = makeTx('ServiceVersionChain.retainResult')(function* (
  tx: ITx<typeof serviceVersionChainDbConfig>,
  row: typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect,
  command: typeof ServiceTerminalCommandSchema.Type,
  operations: readonly IOperationRow[],
) {
  const { commands, modelOperations: operationTable } =
    serviceVersionChainDbConfig.schema;
  const existing = tx
    .select()
    .from(commands)
    .where(eq(commands.serviceIndex, row.serviceIndex))
    .get();
  if (existing !== undefined) {
    const retained = readServiceVersionChainOutput(tx, row.id);
    const sameCommand = isEqual(existing, row);
    if (!sameCommand || !isEqual(retained, operations)) {
      return yield* makeZerospinError('finalized-command-conflict');
    }
    return;
  }
  const tip = tx
    .select()
    .from(commands)
    .orderBy(desc(commands.serviceIndex))
    .limit(1)
    .get();
  if (
    row.serviceIndex !== (tip?.serviceIndex ?? 0) + 1 ||
    row.executedIndex !== (tip?.executedIndex ?? 0) + 1
  ) {
    return yield* makeZerospinError({
      code: 'finalized-command-gap',
      message: 'Finalized history must be contiguous',
    });
  }
  const previous =
    tip === undefined
      ? genesisDispositionHash()
      : (yield* serviceVersionChainDbConfig.tables.commands
          .decodeRow(tip)
          .pipe(Effect.flatMap(readServiceCommand))).dispositionHash;
  if (
    previous === null ||
    command.dispositionHash !==
      advanceDispositionHash({
        failure:
          command.admission.status === 'failed'
            ? command.admission.failure
            : command.execution.status === 'failed'
              ? command.execution.failure
              : null,
        previousDispositionHash: previous,
        serviceIndex: row.serviceIndex,
        commandId: command.id,
        disposition:
          command.execution.status === 'succeeded' ? 'success' : 'failure',
      })
  ) {
    return yield* makeZerospinError({
      code: 'finalized-command-hash-mismatch',
      message: 'Finalized disposition hash does not extend retained history',
    });
  }
  // Transfer encoded values from the outbox without re-encoding JSON or dates.
  tx.insert(commands)
    .values({
      id: row.id,
      commandName: row.commandName,
      payload: row.payload,
      asyncInput: row.asyncInput,
      contractVersion: row.contractVersion,
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion,
      caller: row.caller,
      admission: row.admission,
      execution: row.execution,
      dispositionHash: row.dispositionHash,
      serviceIndex: row.serviceIndex,
      executedIndex: row.executedIndex,
      executionVersion: row.executionVersion,
    })
    .run();
  if (operations.length > 0) {
    for (const operation of operations) {
      if ('asyncContractName' in operation) {
        tx.insert(serviceVersionChainDbConfig.schema.asyncOperations)
          .values(operation)
          .run();
      } else {
        tx.insert(operationTable).values(operation).run();
      }
    }
  }
});
/** Retain contiguous service history and validate each disposition hash. */
export const receiveResults = Effect.fn('ServiceVersionChain.receiveResults')(
  function* (props: {
    db: IDb<typeof serviceVersionChainDbConfig>;
    key: {
      serviceName: string;
      serviceVersion: string;
    };
    rows: readonly IExecutedCommandDelivery[];
  }) {
    for (const delivery of props.rows) {
      yield* validateForwardedCommand(delivery.command);

      const { command: row, operations } = delivery;
      const seen = new Set<number>();
      let lastOperationIndex = -1;
      for (const [ordinal, operation] of operations.entries()) {
        if (!('asyncContractName' in operation)) {
          yield* decodeOwnedOperation(operation);
        }
        if ('asyncContractName' in operation) {
          yield* serviceVersionChainDbConfig.tables.asyncOperations
            .decodeRow(operation)
            .pipe(
              mapParseError({
                code: 'finalized-operation-invalid',
                prefix: 'Invalid async output',
              }),
            );
        } else {
          yield* serviceVersionRepoDbConfig.tables.modelOperations
            .decodeRow(operation)
            .pipe(
              mapParseError({
                code: 'finalized-operation-invalid',
                prefix: 'Invalid model output',
              }),
            );
        }
        if (
          operation.serviceIndex !== row.serviceIndex ||
          operation.commandId !== row.id ||
          !Number.isSafeInteger(operation.operationIndex) ||
          operation.operationIndex < 0 ||
          seen.has(operation.operationIndex) ||
          operation.operationIndex <= lastOperationIndex ||
          operation.operationIndex !== ordinal
        ) {
          return yield* makeZerospinError('finalized-operation-invalid');
        }
        seen.add(operation.operationIndex);
        lastOperationIndex = operation.operationIndex;
      }
      const decoded = yield* serviceVersionRepoDbConfig.tables.commands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'finalized-command-invalid',
            prefix: 'Invalid finalized occurrence',
          }),
        );
      const command = yield* readServiceCommand(decoded).pipe(
        mapParseError({
          code: 'finalized-command-invalid',
          prefix: 'Invalid finalized occurrence',
        }),
      );
      if (
        decoded.executionVersion !== props.key.serviceVersion ||
        command.dispositionHash === null ||
        command.serviceName !== props.key.serviceName
      ) {
        return yield* makeZerospinError({
          code: 'finalized-command-target-mismatch',
          message:
            'Finalized occurrence does not belong to this versioned history',
        });
      }
      if (operations.length > 0 && command.execution.status !== 'succeeded') {
        return yield* makeZerospinError('finalized-operation-invalid');
      }
      yield* retainResult(props.db, row, command, operations).pipe(
        Effect.mapError(cause =>
          isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
            ? cause
            : makeZerospinError({
                code: 'finalized-command-commit-failed',
                message: 'Failed to persist finalized occurrence',
                cause: prettyUnknownFailure(cause),
              }),
        ),
      );
    }
  },
);
