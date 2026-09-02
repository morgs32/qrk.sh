declare module 'cloudflare:workers' {
  export const env: {
    AGGREGATE_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').AggregateCommandChain
    >;
    SERVICE_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').ServiceCommandChain
    >;
    AGGREGATE_FRONTEND_PUSHED_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').AggregateFrontendPushedCommandChain
    >;
    AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').AggregateFrontendFinalizedCommandChain
    >;
    SERVICE_FRONTEND_FINALIZED_COMMAND_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').ServiceFrontendFinalizedCommandChain
    >;
    MATERIALIZED_AGGREGATE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').MaterializedAggregateRepo
    >;
    MATERIALIZED_SERVICE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').MaterializedServiceRepo
    >;
    MATERIALIZED_AGGREGATE_FRONTEND_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').MaterializedAggregateFrontendRepo
    >;
    MATERIALIZED_SERVICE_FRONTEND_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').MaterializedServiceFrontendRepo
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').SystemLogAgent
    >;
    SYSTEM_REPO: DurableObjectNamespace<import('system-worker').SystemRepo>;
    ZEROSPIN_ENVIRONMENT: 'production';
    ZEROSPIN_PUBLISHABLE_KEY: string;
    ZEROSPIN_SECRET_KEY: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
  };

  export class WorkerEntrypoint {
    fetch(request: Request): Promise<Response>;
  }

  export class DurableObject<Env = Cloudflare.Env> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    fetch(request: Request): Promise<Response>;
  }
}
