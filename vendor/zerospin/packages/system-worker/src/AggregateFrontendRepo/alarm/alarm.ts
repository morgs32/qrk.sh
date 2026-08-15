import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainAggregateFrontendBlockOutbox } from '../drainAggregateFrontendBlockOutbox/drainAggregateFrontendBlockOutbox.js';
import { drainPushBlockOutbox } from '../drainPushBlockOutbox/drainPushBlockOutbox.js';

export const alarm = Effect.fn('AggregateFrontendRepo.alarm')(
  function* (props: {
    configuredSystemId: string;
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    storage: DurableObjectStorage;
  }): Effect.fn.Return<void, IAnyError, Async> {
    yield* drainAggregateFrontendBlockOutbox({ ...props, alarm: true });
    yield* drainPushBlockOutbox({ ...props, alarm: true });
  },
);
