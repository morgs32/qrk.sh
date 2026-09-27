import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { Effect } from 'effect';

import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo.js';

/*
 * Snapshot reads replay a bounded actor-command suffix through the same subscriber
 * that receives live delivery, without changing its activation-owned subscription.
 *
 * 1. Catch up without holding the local execution permit.
 */
export const catchup = Effect.fn('AggregateActorVersionRepo.catchup')(
  function* (props: {
    throughExecutedIndex?: number;
    subscriber: Pick<
      ReturnType<AggregateActorVersionRepo['executionResultsFanoutSubscriber']>,
      'catchup'
    >;
  }) {
    // 1 — subscriber-owned catch-up commits its fixed destination without re-enrollment
    yield* makeAsync(() =>
      props.subscriber.catchup(props.throughExecutedIndex),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
  },
);
