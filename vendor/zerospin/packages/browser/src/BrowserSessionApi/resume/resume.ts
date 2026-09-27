import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const resume = Effect.fn('BrowserSessionApi.resume')(function* (props: {
  api: BrowserSessionApi;
}) {
  const { api } = props;
  return yield* Effect.gen(function* () {
    if (!api.isCurrent()) {
      return yield* makeZerospinError({ code: 'node-signed-out' });
    }
    if (api.detached) {
      return yield* makeZerospinError({ code: 'node-tab-detached' });
    }
    return yield* Effect.tryPromise({
      try: () => api.synchronization?.resume() ?? Promise.resolve(),
      catch: catchZerospinError({ code: 'node-resume-failed' }),
    });
  }).pipe(encodeRpcOutcome);
});
