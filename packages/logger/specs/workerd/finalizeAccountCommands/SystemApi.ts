import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableRpcTarget,
} from '@zerospin/logger';
import {
  env,
  WorkerEntrypoint,
  exports as workerExports,
} from 'cloudflare:workers';
import { Effect } from 'effect';

export { AccountBlockRepo } from './AccountBlockRepo.ts';
export { AccountRepo } from './AccountRepo.ts';
export { ActorRepo } from './ActorRepo.ts';
export { ResetRepo } from './ResetRepo.ts';
export { SystemWorker } from './SystemWorker.ts';

// The default Worker is the originating SystemApi boundary. Calling the named
// SystemWorker export forces the first hop through a real workerd loopback RPC.
// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default class SystemApi extends WorkerEntrypoint {
  async finalizeAccountCommands() {
    const collector = makeTelemetryCollector();
    const systemWorker = workerExports.SystemWorker;
    let resetRequested =
      await env.RESET_REPO.getByName('system-worker').consumeResetRequest();
    const wrappedSystemWorker = makeTraceableRpcTarget({
      finalizeAccountBlock: (
        request: Parameters<typeof systemWorker.finalizeAccountBlock>[0],
      ) => {
        if (resetRequested) {
          resetRequested = false;
          return Promise.reject(
            new Error('Durable Object reset because its code was updated'),
          );
        }
        return systemWorker.finalizeAccountBlock(request);
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* wrappedSystemWorker
          .finalizeAccountBlock()
          .pipe(Effect.retry({ times: 5 }));
      }).pipe(
        Effect.withSpan('SystemApi.finalizeAccountCommands'),
        Effect.provide(makeTelemetryLayer(collector)),
      ),
    );

    return {
      result,
      telemetry: collector.flush(),
    };
  }
}
