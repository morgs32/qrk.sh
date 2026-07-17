import {
  makeRpcHandler,
  makeTraceableRpcTarget,
  type IRpcRequest,
} from '@zerospin/logger';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { Effect } from 'effect';

// This is a named WorkerEntrypoint, matching the production SystemWorker hop.
// It consumes the explicit fault request before asking a different ResetRepo
// instance to abort, so SystemApi records one lost span and owns the retry.
export class SystemWorker extends WorkerEntrypoint {
  async finalizeAccountBlock(request: IRpcRequest<[]>) {
    const resetRequested =
      await env.RESET_REPO.getByName('system-worker').consumeResetRequest();
    if (resetRequested) {
      await env.RESET_REPO.getByName('system-worker-reset').resetNow();
    }

    const wrappedAccountRepo = makeTraceableRpcTarget(
      env.ACCOUNT_REPO.getByName('account'),
    );

    return Effect.runPromise(
      makeRpcHandler('SystemWorker.finalizeAccountBlock')(function* () {
        yield* Effect.logInfo('system worker finalize started');
        const result = yield* wrappedAccountRepo.finalizeAccountBlock();
        yield* Effect.logInfo('system worker finalize succeeded');
        return result;
      })(request),
    );
  }
}
