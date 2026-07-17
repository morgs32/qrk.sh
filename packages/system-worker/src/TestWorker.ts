/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

export { AccountBlockRepo } from './AccountBlockRepo/AccountBlockRepo.js';
export { AccountRepo } from './AccountRepo/AccountRepo.js';
export { ActorRepo } from './ActorRepo/ActorRepo.js';
export { ActorBlockRepo } from './ActorBlockRepo/ActorBlockRepo.js';
export { FrontendRepo } from './FrontendRepo/FrontendRepo.js';
export { FrontendBlockRepo } from './FrontendBlockRepo/FrontendBlockRepo.js';
export { AuthorizationRepo } from './AuthorizationRepo/AuthorizationRepo.js';
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
export { ServiceRepo } from './ServiceRepo/ServiceRepo.js';
export { ServiceBlockRepo } from './ServiceBlockRepo/ServiceBlockRepo.js';
export { SystemRepo } from './SystemRepo/SystemRepo.js';
export { FixtureRepo } from './FixtureRepo/FixtureRepo.js';

// eslint-disable-next-line no-default-export
export default {
  fetch() {
    return new Response('ok');
  },
};
