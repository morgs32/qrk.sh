import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const alarm = Effect.fn('MaterializedAggregateFrontendRepo.alarm')(
  function* (props: {
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    finalizedCommandChains: Cloudflare.Env['AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN'];
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    storage: DurableObjectStorage;
  }) {
    yield* runScheduledWork(props);
  },
);
