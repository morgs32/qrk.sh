import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BrowserNode } from '../BrowserNode.ts';

export const clearAuthentication = Effect.fn('BrowserNode.clearAuthentication')(
  function* (props: { api: BrowserNode }) {
    const { api } = props;
    return yield* Effect.gen(function* () {
      if (api.detached) {
        return yield* makeZerospinError({ code: 'node-tab-detached' });
      }
      return yield* Effect.tryPromise({
        try: () => api.clear?.() ?? api.node.clearAuthentication(),
        catch: catchZerospinError({ code: 'node-clearAuthentication-failed' }),
      });
    }).pipe(encodeRpcOutcome);
  },
);
