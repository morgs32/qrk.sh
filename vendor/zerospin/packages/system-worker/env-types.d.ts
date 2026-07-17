/**
 * Bindings-only mirror of the `Cloudflare.Env` block in
 * `system-worker/worker-configuration.d.ts`. Hand-kept in sync with that file
 * so admin (and any other downstream package) can pull in system-worker's
 * `Cloudflare.Env` augmentation via triple-slash reference without also
 * pulling in the full `Begin runtime types` block (which would collide on
 * `declare class DOMException`/etc. with the consumer's own
 * worker-configuration.d.ts).
 *
 * When `wrangler types` regenerates `worker-configuration.d.ts` with a new
 * binding, mirror the change here.
 */
declare namespace Cloudflare {
  interface Env {
    TESTING: false;
    ZEROSPIN_ENVIRONMENT_ID: 'zerospin-dev';
    ZEROSPIN_DEPLOY_ID: string;
    ZEROSPIN_GENERATION_ID: string;
    ZEROSPIN_INSTANCE_ID: string;
    ZEROSPIN_SYSTEM_ID: string;
    ZEROSPIN_VERSION_METADATA: WorkerVersionMetadata;
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string;
    OTEL_EXPORTER_OTLP_LOGS_HEADERS?: string;
    OTEL_SERVICE_NAME?: string;
    SYSTEM_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').SystemRepo
    >;
    ACCOUNT_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AccountRepo
    >;
    SERVICE_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').ServiceRepo
    >;
    ACCOUNT_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AccountBlockRepo
    >;
    ACTOR_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').ActorBlockRepo
    >;
    FRONTEND_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').FrontendRepo
    >;
    FRONTEND_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').FrontendBlockRepo
    >;
    SERVICE_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').ServiceBlockRepo
    >;
    AUTHORIZATION_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AuthorizationRepo
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('./src/SystemWorker').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('./src/SystemWorker').SystemLogAgent
    >;
    ACTOR_REPO: DurableObjectNamespace<import('./src/SystemWorker').ActorRepo>;
  }
}
