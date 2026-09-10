declare module 'cloudflare:workers' {
  export const env: {
    AGGREGATE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').AggregateChain
    >;
    SERVICE_ADMITTED_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').ServiceAdmittedChain
    >;
    VERSIONED_AGGREGATE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').VersionedAggregateChain
    >;
    VERSIONED_SERVICE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').VersionedServiceChain
    >;
    USER_VERSIONED_AGGREGATE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').UserVersionedAggregateChain
    >;
    FRONTEND_SERVICE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').FrontendServiceChain
    >;
    VERSIONED_AGGREGATE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').VersionedAggregateRepo
    >;
    VERSIONED_SERVICE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').VersionedServiceRepo
    >;
    USER_VERSIONED_AGGREGATE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').UserVersionedAggregateRepo
    >;
    FRONTEND_VERSIONED_SERVICE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').FrontendVersionedServiceRepo
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').SystemLogAgent
    >;
    SYSTEM_REPO: DurableObjectNamespace<import('system-worker').SystemRepo>;
    ZEROSPIN_ENVIRONMENT: 'dev';
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
