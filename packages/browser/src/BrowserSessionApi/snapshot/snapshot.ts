import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const snapshot = Effect.fn('BrowserSessionApi.snapshot')(
  function* (props: { api: BrowserSessionApi }) {
    const { api } = props;
    return yield* Effect.gen(function* () {
      if (api.detached) {
        return yield* makeZerospinError({ code: 'node-tab-detached' });
      }
      return yield* Effect.tryPromise({
        try: () => api.node.snapshot(),
        catch: catchZerospinError({ code: 'node-snapshot-failed' }),
      });
    }).pipe(encodeRpcOutcome);
  },
);
