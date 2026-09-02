import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect, Result } from 'effect';

import type { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';

export const makeFanoutQueue = <SUBSCRIBER>(props: {
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  name: string;
  readSubscribers(): Effect.Effect<readonly SUBSCRIBER[], IAnyError, Async>;
  subscriberKey(subscriber: SUBSCRIBER): string;
  processSubscriber(
    subscriber: SUBSCRIBER,
    retry: ReturnType<typeof makeDeliveryQueue>['retry'],
  ): Effect.Effect<boolean, IAnyError, Async>;
  hasPending(): Effect.Effect<boolean, IAnyError, Async>;
}) => ({
  name: props.name,
  drain: Effect.fn(`${props.name}.drain`)(function* () {
    const subscribers = (yield* props.readSubscribers()).slice(0, 100);
    const subscriberResults = yield* Effect.forEach(
      subscribers,
      subscriber =>
        props
          .processSubscriber(subscriber, props.deliveryQueue.retry)
          .pipe(Effect.result),
      { concurrency: 100 },
    );
    const subscriberFailure = subscriberResults.find(Result.isFailure);
    if (subscriberFailure !== undefined) {
      return yield* subscriberFailure.failure;
    }
  }),
  hasPending: props.hasPending,
});
