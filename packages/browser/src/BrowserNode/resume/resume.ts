import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BrowserNode } from '../BrowserNode.ts';

export const resume = Effect.fn('BrowserNode.resume')(function* (props: {
  api: BrowserNode;
}) {
  const { api } = props;
  return yield* Effect.gen(function* () {
    if (api.detached) {
      return yield* makeZerospinError({ code: 'node-tab-detached' });
    }
    return yield* Effect.tryPromise({
      try: () => api.synchronization?.resume() ?? Promise.resolve(),
      catch: catchZerospinError({ code: 'node-resume-failed' }),
    });
  }).pipe(encodeRpcOutcome);
});
