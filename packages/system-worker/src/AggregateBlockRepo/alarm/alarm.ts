/*
 * System-worker annotation:
 * Re-enters the AggregateBlockRepo queue from the Durable Object alarm.
 */

import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainAggregateFrontendOutbox } from '../drainAggregateFrontendOutbox/drainAggregateFrontendOutbox.js';
import type { refreshQueue } from '../refreshQueue/refreshQueue.js';

export const alarm = Effect.fn('AggregateBlockRepo.alarm')(function* (props: {
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  storage: DurableObjectStorage;
  refresh(): Effect.Effect<
    Effect.Effect.Success<ReturnType<typeof refreshQueue>>,
    IAnyError,
    Async
  >;
  processSubscriber(
    subscriberDelivery: Effect.Effect.Success<
      ReturnType<typeof refreshQueue>
    >[number],
    retry: ReturnType<typeof makeDeliveryQueue>['retry'],
  ): Effect.Effect<boolean, IAnyError, Async>;
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* drainAggregateFrontendOutbox({ ...props, alarm: true });
});
