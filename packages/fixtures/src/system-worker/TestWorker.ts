/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

export { AggregateChain } from 'system-worker';
export { AggregateVersionRepo } from 'system-worker';
export { AggregateActorVersionRepo } from 'system-worker';
export { AggregateActorVersionChain } from 'system-worker';
export { AggregateVersionChain } from 'system-worker';
export { ServiceVersionChain } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { ServiceVersionRepo } from 'system-worker';
export { ServiceChain } from 'system-worker';
export { ServiceActorVersionRepo } from 'system-worker';
export { ServiceActorVersionChain } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { FixtureRepo } from './FixtureRepo.ts';
export { FixedDORepoFixture } from './FixedDORepoFixture.ts';
export { MigratableDORepoFixture } from './MigratableDORepoFixture.ts';

// eslint-disable-next-line no-default-export
export default {
  fetch() {
    return new Response('ok');
  },
};

export {
  OutboxSenderFixture,
  OutboxReceiverFixture,
} from './workerd/OutboxFixture.ts';
