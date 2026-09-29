declare module 'cloudflare:workers' {
  export const env: {
    AGGREGATE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').AggregateChain
    >;
    SERVICE_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').ServiceChain
    >;
    AGGREGATE_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').AggregateVersionChain
    >;
    SERVICE_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').ServiceVersionChain
    >;
    AGGREGATE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').AggregateActorVersionChain
    >;
    SERVICE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').ServiceActorVersionChain
    >;
    AGGREGATE_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').AggregateVersionRepo
    >;
    SERVICE_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').ServiceVersionRepo
    >;
    AGGREGATE_ACTOR_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('system-worker').AggregateActorVersionRepo
    >;
    SERVICE_ACTOR_VERSION_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').ServiceActorVersionRepo
    >;
    AGGREGATE_MACHINE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('./machineRepos.js').AggregateMachineRepo
    >;
    SERVICE_MACHINE_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('./machineRepos.js').ServiceMachineRepo
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
