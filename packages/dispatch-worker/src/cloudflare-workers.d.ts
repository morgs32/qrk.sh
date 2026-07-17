declare module 'cloudflare:workers' {
  export const env: {
    ACTOR_BLOCK_REPO: {
      getByName(name: string): {
        fetch(request: Request): Promise<Response>;
      };
    };
    FRONTEND_REPO: DurableObjectNamespace<
      import('@zerospin/system-worker').FrontendRepo
    >;
    FRONTEND_BLOCK_REPO: DurableObjectNamespace<
      import('@zerospin/system-worker').FrontendBlockRepo
    >;
    SERVICE_BLOCK_REPO: DurableObjectNamespace<
      import('@zerospin/system-worker').ServiceBlockRepo
    >;
    SYSTEM_LOG_REPO: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').SystemLogRepo
    >;
    SYSTEM_LOG_AGENT: DurableObjectNamespace<
      Rpc.DurableObjectBranded &
        import('@zerospin/system-worker').SystemLogAgent
    >;
    DEV_ZEROSPIN_APIS: DurableObjectNamespace<
      import('./DevZerospinApis/DevZerospinApis').DevZerospinApis
    >;
    DEV?: string;
    ZEROSPIN_CLEAN_REQUEST_ID?: string;
    ZEROSPIN_DEPLOY_ID: string;
    ZEROSPIN_GENERATION_ID: string;
    ZEROSPIN_INSTANCE_ID: string;
    ZEROSPIN_SYSTEM_ID: import('@zerospin/core/system/types').ISystemId;
    ZEROSPIN_VERSION_METADATA: {
      id: string;
    };
  };

  export const exports: {
    default: {
      fetch(request: Request): Promise<Response>;
    };
    DevZerospinApis: DurableObjectNamespace<
      import('./DevZerospinApis/DevZerospinApis').DevZerospinApis
    >;
    ServiceRepo: typeof import('system-worker').ServiceRepo;
    SystemWorker: import('system-worker').SystemWorker;
  };

  export class WorkerEntrypoint {
    protected ctx: {
      exports: {
        DevZerospinApis?: DurableObjectNamespace<
          import('./DevZerospinApis/DevZerospinApis').DevZerospinApis
        >;
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
