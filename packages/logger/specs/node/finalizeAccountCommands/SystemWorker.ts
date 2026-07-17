import {
  makeRpcHandler,
  makeTraceableRpcTarget,
  type IRpcRequest,
} from '@zerospin/logger';
import { Effect } from 'effect';

import { accountRepo } from './AccountRepo.ts';
import { harness } from './queuedJobs.ts';

const wrappedAccountRepo = makeTraceableRpcTarget(accountRepo);

const finalizeAccountBlockHandler = makeRpcHandler(
  'SystemWorker.finalizeAccountBlock',
)(function* () {
  yield* Effect.logInfo('system worker finalize started');
  const result = yield* wrappedAccountRepo.finalizeAccountBlock();
  yield* Effect.logInfo('system worker finalize succeeded');
  return result;
});

export const systemWorker = {
  finalizeAccountBlock: async (request: IRpcRequest<[]>) => {
    harness.systemWorkerRpcAttempts += 1;
    if (harness.failNextSystemWorkerRpc) {
      harness.failNextSystemWorkerRpc = false;
      return Promise.reject(
        new Error('Durable Object reset because its code was updated'),
      );
    }
    return Effect.runPromise(finalizeAccountBlockHandler(request));
  },
};
