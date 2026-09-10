import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';

import {
  AggregateChainDb,
  aggregateChainDbConfig,
} from '../aggregateChainDbConfig.js';

/** Commit complete, validated occurrences together; retries recover retained receipts. */
export const admitCommandsTx = makeTx(
  'AggregateChain.admitCommandsTx',
  AggregateChainDb,
)(function* (
  preparedCommands: readonly {
    command: IEncodedCommand<IAggregateCommand>;
    bytes: string;
  }[],
) {
  const tx = yield* AggregateChainDb.Tx;
  const { admittedCommands } = aggregateChainDbConfig.schema;
  const receipts: { aggregateIndex: number; commandId: string }[] = [];

  // Read the latest aggregateIndex inside the insertion transaction.
  let index =
    tx
      .select({ index: admittedCommands.aggregateIndex })
      .from(admittedCommands)
      .orderBy(desc(admittedCommands.aggregateIndex))
      .limit(1)
      .get()?.index ?? 0;

  for (const { command, bytes } of preparedCommands) {
    // Require identical canonicalBytes before reusing its receipt. This also
    // handles repeated IDs within this batch after an earlier insertion.
    const retained = tx
      .select()
      .from(admittedCommands)
      .where(eq(admittedCommands.commandId, command.id))
      .get();
    if (retained !== undefined) {
      if (retained.canonicalBytes !== bytes) {
        return yield* new ZerospinError({
          code: 'aggregate-chain-command-conflict',
          message: 'Command ID already has another input',
        });
      }
      receipts.push({
        aggregateIndex: retained.aggregateIndex,
        commandId: command.id,
      });
      continue;
    }

    index += 1;
    // Store identical canonicalBytes and command bytes as an aggregate occurrence.
    tx.insert(admittedCommands)
      .values({
        aggregateIndex: index,
        commandId: command.id,
        canonicalBytes: bytes,
        command: bytes,
        chainedAt: new Date(),
      })
      .run();
    receipts.push({ aggregateIndex: index, commandId: command.id });
  }
  return receipts;
});
