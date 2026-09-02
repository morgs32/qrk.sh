import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const alarm = Effect.fn('AggregateCommandChain.alarm')(
  function* (props: {
    db: Parameters<typeof runScheduledWork>[0]['db'];
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    materializedAggregateFrontendRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_FRONTEND_REPO'];
    materializedAggregateRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_REPO'];
    storage: DurableObjectStorage;
  }) {
    yield* runScheduledWork(props);
  },
);
