import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainAggregateOutboxes } from '../drainAggregateOutboxes/drainAggregateOutboxes.js';

export const alarm = Effect.fn('AggregateRepo.alarm')(function* (props: {
  aggregateRepoName: string;
  generationId: string;
  aggregateId: string;
  aggregateName: string;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* drainAggregateOutboxes({ ...props, alarm: true });
});
