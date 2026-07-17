import { Context } from 'effect';
import type { SystemWorker } from 'system-worker';

export interface ISystemWorkerResolver {
  /**
   * Resolve the SystemWorker RPC stub for a deploy. Resolved inside each API
   * method call (never held on an RpcTarget instance) so stubs stay fresh
   * across DO redeploys.
   */
  readonly get: (props: {
    systemWorkerName: string;
  }) => SystemWorker & Disposable;
}

export class SystemWorkerResolver extends Context.Tag('SystemWorkerResolver')<
  SystemWorkerResolver,
  ISystemWorkerResolver
>() {}
