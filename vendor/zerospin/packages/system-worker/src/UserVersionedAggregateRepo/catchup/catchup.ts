import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect } from 'effect';

import type { UserVersionedAggregateRepo } from '../UserVersionedAggregateRepo.js';

/*
 * Snapshot reads replay a bounded finalized suffix through the same subscriber
 * that receives live delivery, without changing its activation-owned subscription.
 *
 * 1. Catch up without holding the local execution permit.
 */
export const catchup = Effect.fn('UserVersionedAggregateRepo.catchup')(
  function* (props: {
    throughAggregateIndex?: number;
    subscriber: Pick<
      ReturnType<UserVersionedAggregateRepo['replicaFanoutQueueSubscriber']>,
      'catchup'
    >;
  }) {
    // 1 — subscriber-owned catch-up commits its fixed destination without re-enrollment
    yield* makeAsync(() =>
      props.subscriber.catchup(props.throughAggregateIndex),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);
