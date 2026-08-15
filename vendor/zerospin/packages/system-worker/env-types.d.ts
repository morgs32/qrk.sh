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
    ZEROSPIN_CLEAN_REQUEST_ID?: string;
    ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    ZEROSPIN_PUBLISHABLE_KEY?: string;
    ZEROSPIN_SECRET_KEY: string;
    ZEROSPIN_SYSTEM_ID: string;
    WORKER_VERSION_METADATA: WorkerVersionMetadata;
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string;
    OTEL_EXPORTER_OTLP_LOGS_HEADERS?: string;
    OTEL_SERVICE_NAME?: string;
    SYSTEM_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').SystemRepo
    >;
    AGGREGATE_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AggregateRepo
    >;
    SERVICE_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').ServiceRepo
    >;
    AGGREGATE_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AggregateBlockRepo
    >;
    AGGREGATE_FRONTEND_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AggregateFrontendRepo
    >;
    AGGREGATE_FRONTEND_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').AggregateFrontendBlockRepo
    >;
    SERVICE_BLOCK_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').ServiceBlockRepo
    >;
    SERVICE_FRONTEND_REPO: DurableObjectNamespace<
      import('./src/SystemWorker').ServiceFrontendRepo
    >;
    SERVICE_FRONTEND_BLOCK_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo').IServiceFrontendBlockRepoRpcTarget
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('./src/SystemWorker').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('./src/SystemWorker').SystemLogAgent
    >;
  }
}
