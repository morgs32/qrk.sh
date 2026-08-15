import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect, Either } from 'effect';

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
    const exhaustedSubscribers = new Set<string>();
    while (true) {
      const subscribers = (yield* props.readSubscribers()).filter(
        subscriber =>
          !exhaustedSubscribers.has(props.subscriberKey(subscriber)),
      );
      if (subscribers.length === 0) {
        return;
      }
      const subscriberResults = yield* Effect.forEach(
        subscribers,
        subscriber =>
          props
            .processSubscriber(subscriber, props.deliveryQueue.retry)
            .pipe(Effect.either),
        { concurrency: 100 },
      );
      for (let index = 0; index < subscriberResults.length; index += 1) {
        const result = subscriberResults[index];
        const subscriber = subscribers[index];
        if (
          result !== undefined &&
          subscriber !== undefined &&
          Either.isRight(result) &&
          !result.right
        ) {
          exhaustedSubscribers.add(props.subscriberKey(subscriber));
        }
      }
      const subscriberFailure = subscriberResults.find(Either.isLeft);
      if (subscriberFailure !== undefined) {
        return yield* subscriberFailure.left;
      }
    }
  }),
  hasPending: props.hasPending,
});
