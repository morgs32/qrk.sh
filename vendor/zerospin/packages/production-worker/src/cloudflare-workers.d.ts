declare module 'cloudflare:workers' {
  export const env: {
    AGGREGATE_FRONTEND_REPO: DurableObjectNamespace<
      import('system-worker').AggregateFrontendRepo
    >;
    AGGREGATE_FRONTEND_BLOCK_REPO: DurableObjectNamespace<
      import('system-worker').AggregateFrontendBlockRepo
    >;
    SERVICE_BLOCK_REPO: DurableObjectNamespace<
      import('system-worker').ServiceBlockRepo
    >;
    SERVICE_FRONTEND_REPO: DurableObjectNamespace<
      import('system-worker').ServiceFrontendRepo
    >;
    SERVICE_FRONTEND_BLOCK_REPO: DurableObjectNamespace<
      import('system-worker').ServiceFrontendBlockRepo
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded & import('system-worker').SystemLogAgent
    >;
    SYSTEM_REPO: DurableObjectNamespace<import('system-worker').SystemRepo>;
    ZEROSPIN_CLEAN_REQUEST_ID?: string;
    ZEROSPIN_ENVIRONMENT: 'production';
    ZEROSPIN_PUBLISHABLE_KEY: string;
    ZEROSPIN_SECRET_KEY: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
    WORKER_VERSION_METADATA: {
      id: string;
    };
  };

  export const exports: {
    default: {
      fetch(request: Request): Promise<Response>;
    };
    ServiceRepo: typeof import('system-worker').ServiceRepo;
    SystemRepo: typeof import('system-worker').SystemRepo;
    SystemWorker: import('system-worker').SystemWorker;
  };

  export class WorkerEntrypoint {
    protected ctx: {
      exports: {
        SystemRepo?: DurableObjectNamespace<import('system-worker').SystemRepo>;
        SystemWorker?: import('system-worker').SystemWorker;
      };
    };
    fetch(request: Request): Promise<Response>;
  }

  export class DurableObject<Env = Cloudflare.Env> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    fetch(request: Request): Promise<Response>;
  }
}
