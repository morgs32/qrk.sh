/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

export { AggregateChain } from './AggregateChain/AggregateChain.js';
export { AggregateVersionRepo } from './AggregateVersionRepo/AggregateVersionRepo.js';
export { AggregateActorVersionRepo } from './AggregateActorVersionRepo/AggregateActorVersionRepo.js';
export { AggregateActorVersionChain } from './AggregateActorVersionChain/AggregateActorVersionChain.js';
export { AggregateVersionChain } from './AggregateVersionChain/AggregateVersionChain.js';
export { ServiceVersionChain } from './ServiceVersionChain/ServiceVersionChain.js';
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
export { ServiceVersionRepo } from './ServiceVersionRepo/ServiceVersionRepo.js';
export { ServiceChain } from './ServiceChain/ServiceChain.js';
export { ServiceActorVersionRepo } from './ServiceActorVersionRepo/ServiceActorVersionRepo.js';
export { ServiceActorVersionChain } from './ServiceActorVersionChain/ServiceActorVersionChain.js';
export { SystemRepo } from './SystemRepo/SystemRepo.js';
export { FixtureRepo } from './FixtureRepo/FixtureRepo.js';
export { FixedDORepoFixture } from './makeFixedDORepo/test/FixedDORepoFixture.js';
export { MigratableDORepoFixture } from './makeMigratableDORepo/test/MigratableDORepoFixture.js';

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
