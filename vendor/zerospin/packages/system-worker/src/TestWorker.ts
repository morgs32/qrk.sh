/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

export { AggregateBlockRepo } from './AggregateBlockRepo/AggregateBlockRepo.js';
export { AggregateRepo } from './AggregateRepo/AggregateRepo.js';
export { AggregateFrontendRepo } from './AggregateFrontendRepo/AggregateFrontendRepo.js';
export { AggregateFrontendBlockRepo } from './AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
export { SystemWorker } from './SystemWorker.js';
export { ServiceRepo } from './ServiceRepo/ServiceRepo.js';
export { ServiceBlockRepo } from './ServiceBlockRepo/ServiceBlockRepo.js';
export { ServiceFrontendRepo } from './ServiceFrontendRepo/ServiceFrontendRepo.js';
export { ServiceFrontendBlockRepo } from './ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
export { SystemRepo } from './SystemRepo/SystemRepo.js';
export { FixtureRepo } from './FixtureRepo/FixtureRepo.js';
export { BoundDORepoFixture } from './makeBoundDORepo/test/BoundDORepoFixture.js';

// eslint-disable-next-line no-default-export
export default {
  fetch() {
    return new Response('ok');
  },
};
