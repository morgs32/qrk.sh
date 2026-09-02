import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const alarm = Effect.fn('ServiceCommandChain.alarm')(function* (props: {
  aggregateCommandChains: Cloudflare.Env['AGGREGATE_COMMAND_CHAIN'];
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  materializedServiceFrontendRepos: Cloudflare.Env['MATERIALIZED_SERVICE_FRONTEND_REPO'];
  materializedServiceRepos: Cloudflare.Env['MATERIALIZED_SERVICE_REPO'];
  storage: DurableObjectStorage;
}) {
  yield* runScheduledWork(props);
});
