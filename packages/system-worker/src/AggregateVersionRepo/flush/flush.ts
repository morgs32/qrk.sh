import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { AggregateExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { AggregateVersionChain } from '../../AggregateVersionChain/AggregateVersionChain.js';
import { aggregateVersionChainDbConfig } from '../../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import type { AggregateVersionRepo } from '../AggregateVersionRepo.js';
/** Complete execution and durable VAC publication through one fixed checkpoint. */
/*
 * Cutover asks a version-owned aggregate materializer to execute and durably
 * publish one fixed checkpoint. The returned identity and disposition hash come
 * from retained VAC history after executedCommands-outbox acknowledgement.
 *
 * 1. Validate the checkpoint.
 * 2. Return the empty-history checkpoint.
 * 3. Execute through the checkpoint.
 * 4. Wait for bounded durable publication.
 * 5. Read the retained checkpoint from VAC.
 * 6. Reject missing published history.
 * 7. Decode and return checkpoint identity.
 */
export const flush = Effect.fn('AggregateVersionRepo.flush')(function* (props: {
  aggregateIndex: number;
  repo: Pick<AggregateVersionRepo, 'execute'>;
  executionResultsOutbox: Pick<
    AggregateVersionRepo['executionResultsOutbox'],
    'drain'
  >;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  };
}) {
  // 1 — require a nonnegative safe aggregateIndex
  if (!Number.isSafeInteger(props.aggregateIndex) || props.aggregateIndex < 0) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-flush-index-invalid',
        message: 'Flush requires a nonnegative index',
      }),
    );
  }

  // 2 — use a null commandId and genesis disposition hash at zero
  if (props.aggregateIndex === 0) {
    return {
      aggregateIndex: 0,
      commandId: null,
      dispositionHash: genesisDispositionHash(),
    };
  }

  // 3 — await repo.execute before draining its commands outbox
  const executed = yield* makeAsync(() =>
    props.repo.execute({ aggregateIndex: props.aggregateIndex }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

  // 4 — drain output through this aggregate result’s executedIndex
  yield* props.executionResultsOutbox.drain(executed.executedIndex);

  // 5 — request exactly the position that was flushed
  const chain = yield* AggregateVersionChain.getRepo({
    key: props.key,
  });
  const row = yield* makeAsync<
    Awaited<ReturnType<AggregateVersionChain['getAggregateResult']>>
  >(() => chain.getAggregateResult(props.aggregateIndex)).pipe(
    Effect.flatMap(readRpcEnvelope),
  );

  // 6 — require the returned aggregateIndex to equal the requested checkpoint
  if (row === undefined || row.aggregateIndex !== props.aggregateIndex) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-flush-publication-missing',
        message: 'Flush checkpoint has not been published',
      }),
    );
  }

  // 7 — return aggregateIndex, commandId, and dispositionHash from the retained executedCommand
  const command = yield* aggregateVersionChainDbConfig.tables.aggregateCommands
    .decodeRow(row)
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.toType(AggregateExecutedCommandSchema),
        ),
      ),
    )
    .pipe(
      mapParseError({
        code: 'aggregate-flush-result-invalid',
        prefix: 'Invalid flush checkpoint',
      }),
    );
  return {
    aggregateIndex: command.aggregateIndex,
    commandId: command.id,
    dispositionHash: command.dispositionHash,
  };
});
