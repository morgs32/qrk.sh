// oxlint-disable-next-line eslint/no-restricted-imports -- package-local Env augmentation needs the concrete Durable Object classes
import type {
  ActorRepo,
  ServiceRepo,
  SystemRepo,
} from './src/index';
// oxlint-disable-next-line eslint/no-restricted-imports -- package-local Env augmentation needs the concrete Worker class
import type SystemWorker from './src/system-worker';

/**
 * Narrow augmentations for tooling / consumers that do not load the full Wrangler
 * `worker-configuration.d.ts`. Prefer relying on the package's Nx `types` target
 * for bindings; add missing keys here only when Wrangler output lags or a binding is shared
 * across packages.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      ZEROSPIN_DEPLOY_ID: string;
      ZEROSPIN_GENERATION_ID: string;
      ACTOR_REPO: DurableObjectNamespace<ActorRepo>;
      SERVICE_REPO: DurableObjectNamespace<ServiceRepo>;
      SYSTEM_REPO: DurableObjectNamespace<SystemRepo>;
      SYSTEM_WORKER: SystemWorker;
    }
  }
}

export {};
