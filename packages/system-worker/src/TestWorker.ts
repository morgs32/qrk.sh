/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

export { AggregateChain } from './AggregateChain/AggregateChain.js';
export { VersionedAggregateRepo } from './VersionedAggregateRepo/VersionedAggregateRepo.js';
export { UserVersionedAggregateRepo } from './UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
export { UserVersionedAggregateChain } from './UserVersionedAggregateChain/UserVersionedAggregateChain.js';
export { VersionedAggregateChain } from './VersionedAggregateChain/VersionedAggregateChain.js';
export { VersionedServiceChain } from './VersionedServiceChain/VersionedServiceChain.js';
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
export { VersionedServiceRepo } from './VersionedServiceRepo/VersionedServiceRepo.js';
export { ServiceAdmittedChain } from './ServiceAdmittedChain/ServiceAdmittedChain.js';
export { FrontendVersionedServiceRepo } from './FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
export { FrontendServiceChain } from './FrontendServiceChain/FrontendServiceChain.js';
export { SystemRepo } from './SystemRepo/SystemRepo.js';
export { FixtureRepo } from './FixtureRepo/FixtureRepo.js';
export { FixedDORepoFixture } from './makeFixedDORepo/test/FixedDORepoFixture.js';
export { VersionedDORepoFixture } from './makeVersionedDORepo/test/VersionedDORepoFixture.js';

// eslint-disable-next-line no-default-export
export default {
  fetch() {
    return new Response('ok');
  },
};

export {
  OutboxSenderFixture,
  OutboxReceiverFixture,
} from './workerd-utils/OutboxFixture.js';
