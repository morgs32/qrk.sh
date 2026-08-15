import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainServiceBlockOutbox } from '../drainServiceBlockOutbox/drainServiceBlockOutbox.js';

export const alarm = Effect.fn('ServiceRepo.alarm')(function* (props: {
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  generationId: string;
  serviceName: string;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* drainServiceBlockOutbox({ ...props, alarm: true });
});
