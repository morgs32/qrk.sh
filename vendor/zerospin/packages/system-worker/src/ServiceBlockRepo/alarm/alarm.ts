import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainAggregateSubscribers } from '../drainAggregateSubscribers/drainAggregateSubscribers.js';
import { drainServiceFrontendSubscribers } from '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';

export const alarm = Effect.fn('ServiceBlockRepo.alarm')(function* (props: {
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: {
    generationId: string;
    serviceName: string;
  };
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* Effect.all(
    [
      drainAggregateSubscribers({
        alarm: true,
        db: props.db,
        deliveryQueue: props.deliveryQueue,
        serviceName: props.key.serviceName,
      }),
      drainServiceFrontendSubscribers({
        alarm: true,
        db: props.db,
        deliveryQueue: props.deliveryQueue,
        key: props.key,
        onlyServiceFrontendRepoName: null,
      }),
    ],
    { concurrency: 'unbounded' },
  );
});
