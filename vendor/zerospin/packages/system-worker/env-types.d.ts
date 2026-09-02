/**
 * Bindings-only `Cloudflare.Env` augmentation maintained alongside
 * `system-worker/wrangler.jsonc`. Admin and other downstream packages can
 * reference it without pulling in the generated runtime declarations, which
 * would collide on `declare class DOMException` and other globals with the
 * consumer's own worker-configuration.d.ts.
 *
 * `wrangler types` runs with `--include-env=false`; when the Wrangler binding
 * configuration changes, update this interface directly.
 */
declare namespace Cloudflare {
  interface Env {
    ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    ZEROSPIN_PUBLISHABLE_KEY?: string;
    ZEROSPIN_SECRET_KEY?: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string;
    OTEL_EXPORTER_OTLP_LOGS_HEADERS?: string;
    OTEL_SERVICE_NAME?: string;
    SYSTEM_REPO: {
      getByName(
        name: string,
        options?: DurableObjectNamespaceGetDurableObjectOptions,
      ): Pick<
        import('./src/SystemRepo/SystemRepo.js').SystemRepo,
        | 'getAggregateIds'
        | 'createAggregateFrontendWebSocketTicket'
        | 'consumeAggregateFrontendWebSocketTicket'
        | 'createServiceFrontendWebSocketTicket'
        | 'consumeServiceFrontendWebSocketTicket'
        | 'upsertAggregate'
        | 'registerRepo'
        | 'registerRepos'
        | 'getRepoRegistrations'
        | 'getRepoTableRows'
      >;
    };
    MATERIALIZED_AGGREGATE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/MaterializedAggregateRepo/MaterializedAggregateRepo.js').MaterializedAggregateRepo
    >;
    MATERIALIZED_SERVICE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/MaterializedServiceRepo/MaterializedServiceRepo.js').MaterializedServiceRepo
    >;
    AGGREGATE_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/AggregateCommandChain/AggregateCommandChain.js').AggregateCommandChain
    >;
    AGGREGATE_FRONTEND_PUSHED_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/AggregateFrontendPushedCommandChain/AggregateFrontendPushedCommandChain.js').AggregateFrontendPushedCommandChain
    >;
    MATERIALIZED_AGGREGATE_FRONTEND_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/MaterializedAggregateFrontendRepo/MaterializedAggregateFrontendRepo.js').MaterializedAggregateFrontendRepo
    >;
    AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/AggregateFrontendFinalizedCommandChain/AggregateFrontendFinalizedCommandChain.js').AggregateFrontendFinalizedCommandChain
    >;
    SERVICE_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/ServiceCommandChain/ServiceCommandChain.js').ServiceCommandChain
    >;
    MATERIALIZED_SERVICE_FRONTEND_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/MaterializedServiceFrontendRepo/MaterializedServiceFrontendRepo.js').MaterializedServiceFrontendRepo
    >;
    SERVICE_FRONTEND_FINALIZED_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/ServiceFrontendFinalizedCommandChain/ServiceFrontendFinalizedCommandChain.js').ServiceFrontendFinalizedCommandChain
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/SystemLogRepo/SystemLogRepo.js').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('./src/SystemLogAgent/SystemLogAgent.js').SystemLogAgent
    >;
  }
}
