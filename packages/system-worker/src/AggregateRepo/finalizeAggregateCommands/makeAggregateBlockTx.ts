/*
 * System-worker annotation:
 * Builds the flat AggregateRepo outbox block row inside the finalization
 * transaction and advances the aggregate cursor to the row cursor.
 */

import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IExecutedPushedCommand,
  IFailedAggregateCommand,
  IFailedPushedCommand,
  IFinalizedFailedStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import {
  setLastAggregateCursor,
  setLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import type { IAggregateBlock } from '../../types.js';

export const makeAggregateBlockTx = Effect.fn(
  'AggregateRepo.makeAggregateBlockTx',
)(function* (props: {
  writeIndex: number;
  executedCommands: readonly (
    | IEncodedCommand<IExecutedAggregateCommand>
    | IEncodedCommand<IExecutedPushedCommand>
  )[];
  failedCommands: readonly (
    | IEncodedCommand<IFailedAggregateCommand>
    | IEncodedCommand<IFailedPushedCommand>
    | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
  )[];
  appliedMutations: readonly IEncodedAppliedMutation[];
  lastAggregateCursor?: IAggregateCursor;
  aggregateIndex?: number;
  storage: DurableObjectStorage;
  tx: ITx;
}): Effect.fn.Return<IAggregateBlock, IAnyError> {
  const {
    writeIndex,
    appliedMutations,
    failedCommands,
    executedCommands,
    lastAggregateCursor: providedLastAggregateCursor,
    aggregateIndex: providedAggregateIndex,
    storage,
    tx,
  } = props;

  let lastAggregateCursor: IAggregateCursor | null =
    providedLastAggregateCursor ?? null;
  let aggregateIndex: number | null = providedAggregateIndex ?? null;

  if (
    (providedLastAggregateCursor === undefined) !==
    (providedAggregateIndex === undefined)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-block-explicit-watermark-incomplete',
      message:
        'Explicit AggregateBlock creation requires both lastAggregateCursor and aggregateIndex',
    });
  }

  for (const command of executedCommands) {
    if (aggregateIndex === null || command.aggregateIndex > aggregateIndex) {
      lastAggregateCursor = command.aggregateCursor;
      aggregateIndex = command.aggregateIndex;
    }
  }
  for (const command of failedCommands) {
    if (aggregateIndex === null || command.aggregateIndex > aggregateIndex) {
      lastAggregateCursor = command.aggregateCursor;
      aggregateIndex = command.aggregateIndex;
    }
  }

  if (lastAggregateCursor === null || aggregateIndex === null) {
    return yield* new ZerospinError({
      code: 'aggregate-block-has-no-command-rows',
      message:
        'Cannot make an AggregateRepo block with no executed or failed commands',
    });
  }

  const aggregateBlock = {
    writeIndex,
    lastAggregateCursor,
    aggregateIndex,
    executedCommands,
    failedCommands,
    appliedMutations,
  } satisfies IAggregateBlock;

  yield* setLastAggregateCursor({
    storage,
    tx,
    aggregateCursor: aggregateBlock.lastAggregateCursor,
  });
  yield* setLastAggregateIndex({
    storage,
    tx,
    aggregateIndex: aggregateBlock.aggregateIndex,
  });

  return aggregateBlock;
});
