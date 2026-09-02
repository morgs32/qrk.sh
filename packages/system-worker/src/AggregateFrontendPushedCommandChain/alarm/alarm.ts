import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const alarm = Effect.fn('AggregateFrontendPushedCommandChain.alarm')(
  function* (props: {
    aggregateCommandChains: Cloudflare.Env['AGGREGATE_COMMAND_CHAIN'];
    db: Parameters<typeof runScheduledWork>[0]['db'];
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    materializedAggregateFrontendRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_FRONTEND_REPO'];
    storage: DurableObjectStorage;
  }): Effect.fn.Return<void, IAnyError, Async> {
    yield* runScheduledWork(props);
  },
);
