import { exports as workerExports } from 'cloudflare:workers';
import { Layer } from 'effect';
import type { SystemWorker } from 'system-worker';

import { SystemWorkerResolver } from './SystemWorkerResolver';

/**
 * Same-isolate resolver for standalone Workers and workerd tests: every deploy
 * name resolves to the loopback `SystemWorker` export bundled into the Worker.
 */
export const WorkerExportsSystemWorkerResolver = Layer.sync(
  SystemWorkerResolver,
  () => ({
    get: () => {
      const systemWorker = workerExports.SystemWorker;
      if (systemWorker === undefined) {
        throw new Error('Missing SystemWorker loopback export');
      }
      // ALLOWED_CAST: Workerd loopback exports generate a Fetcher-shaped stub, but this test helper consumes the SystemWorker RPC method surface.
      const worker = systemWorker as unknown as SystemWorker & Disposable;
      if (typeof worker[Symbol.dispose] !== 'function') {
        Object.defineProperty(worker, Symbol.dispose, {
          configurable: true,
          value: () => undefined,
        });
      }
      return worker;
    },
  }),
);
