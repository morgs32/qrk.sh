import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { Effect } from 'effect';

import type { ServiceActorVersionRepo } from '../ServiceActorVersionRepo.js';

/*
 * Snapshot reads replay a bounded actor-command suffix through the same subscriber
 * that receives live delivery, without changing its activation-owned subscription.
 *
 * 1. Catch up without holding the local execution permit.
 */
export const catchup = Effect.fn('ServiceActorVersionRepo.catchup')(
  function* (props: {
    throughExecutedIndex?: number | undefined;
    subscriber: Pick<
      ReturnType<ServiceActorVersionRepo['executionResultsFanoutSubscriber']>,
      'catchup'
    >;
  }) {
    const { subscriber, throughExecutedIndex } = props;
    // 1 — subscriber-owned catch-up commits its fixed destination without re-enrollment
    yield* makeAsync(() => subscriber.catchup(throughExecutedIndex)).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
    );
  },
);
