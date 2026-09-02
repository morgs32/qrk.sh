/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

export { AggregateCommandChain } from './AggregateCommandChain/AggregateCommandChain.js';
export { MaterializedAggregateRepo } from './MaterializedAggregateRepo/MaterializedAggregateRepo.js';
export { MaterializedAggregateFrontendRepo } from './MaterializedAggregateFrontendRepo/MaterializedAggregateFrontendRepo.js';
export { AggregateFrontendFinalizedCommandChain } from './AggregateFrontendFinalizedCommandChain/AggregateFrontendFinalizedCommandChain.js';
export { AggregateFrontendPushedCommandChain } from './AggregateFrontendPushedCommandChain/AggregateFrontendPushedCommandChain.js';
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
export { MaterializedServiceRepo } from './MaterializedServiceRepo/MaterializedServiceRepo.js';
export { ServiceCommandChain } from './ServiceCommandChain/ServiceCommandChain.js';
export { MaterializedServiceFrontendRepo } from './MaterializedServiceFrontendRepo/MaterializedServiceFrontendRepo.js';
export { ServiceFrontendFinalizedCommandChain } from './ServiceFrontendFinalizedCommandChain/ServiceFrontendFinalizedCommandChain.js';
export { SystemRepo } from './SystemRepo/SystemRepo.js';
export { FixtureRepo } from './FixtureRepo/FixtureRepo.js';
export { FixedDORepoFixture } from './makeFixedDORepo/test/FixedDORepoFixture.js';
export { EPluribusMachinaFixture } from './workerd-utils/EPluribusMachinaFixture.js';

// eslint-disable-next-line no-default-export
export default {
  fetch() {
    return new Response('ok');
  },
};
