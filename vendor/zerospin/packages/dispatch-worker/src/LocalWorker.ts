/* eslint-disable perfectionist/sort-exports */

// Local Wrangler still needs every system Durable Object export used by the
// generated project configuration. Keep this list explicit so this entrypoint
// does not become a new package barrel.
export { AccountBlockRepo } from 'system-worker';
export { AccountRepo } from 'system-worker';
export { ActorRepo } from 'system-worker';
export { ActorBlockRepo } from 'system-worker';
export { FrontendRepo } from 'system-worker';
export { FrontendBlockRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { AuthorizationRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { ServiceFrontendRepo } from 'system-worker';
export { ServiceFrontendBlockRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';

/**
 * Local development deployment controller.
 *
 * Miniflare keys persisted Durable Object storage by this exported class name.
 * Production uses Worker.ts and its separate SelfHostedZerospinApis namespace.
 */
export { DevZerospinApis } from './DevZerospinApis/DevZerospinApis';

// The request handler contains the explicit local-vs-production routing. This
// local entrypoint changes only which Durable Object class names are exported.
// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export { default } from './Worker.js';
