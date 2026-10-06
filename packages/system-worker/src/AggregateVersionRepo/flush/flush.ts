import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { AggregateVersionChain } from '../../AggregateVersionChain/AggregateVersionChain.js';
import type { AggregateVersionRepo } from '../AggregateVersionRepo.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

/** Flush a shared input checkpoint, including source-only positions, without manufacturing command completion. */
export const flush = Effect.fn('AggregateVersionRepo.flush')(function* (props: {
  aggregateIndex: number;
  repo: Pick<AggregateVersionRepo, 'db' | 'admittedCommandsFanoutSubscriber'>;
  executedCommandOutbox: Pick<
    AggregateVersionRepo['executedCommandOutbox'],
    'drain'
  >;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  };
}) {
  const { aggregateIndex, repo, key, executedCommandOutbox } = props;
  if (!Number.isSafeInteger(aggregateIndex) || aggregateIndex < 0) {
    return yield* makeZerospinError('aggregate-flush-index-invalid');
  }
  if (aggregateIndex === 0) {
    return {
      aggregateIndex,
      commandId: null,
      dispositionHash: genesisDispositionHash(),
    };
  }
  yield* makeAsync(() =>
    repo.admittedCommandsFanoutSubscriber(key).catchup(aggregateIndex),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  const head = repo.db
    .select()
    .from(aggregateVersionRepoDbConfig.schema.head)
    .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
    .get();
  if (head === undefined || head.aggregateIndex < aggregateIndex) {
    return yield* makeZerospinError('aggregate-flush-input-missing');
  }
  yield* executedCommandOutbox.drain(head.executedIndex);
  const chain = yield* AggregateVersionChain.getRepo({ key });
  const checkpoint = yield* makeAsync(() =>
    chain.getInputCheckpoint(aggregateIndex),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  if (checkpoint === null) {
    return yield* makeZerospinError('aggregate-flush-publication-missing');
  }
  return checkpoint;
});
