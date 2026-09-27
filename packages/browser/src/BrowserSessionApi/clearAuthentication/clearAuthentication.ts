import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const clearAuthentication = Effect.fn(
  'BrowserSessionApi.clearAuthentication',
)(function* (props: { api: BrowserSessionApi }) {
  const { api } = props;
  return yield* Effect.gen(function* () {
    if (!api.isCurrent()) {
      return yield* makeZerospinError({ code: 'node-signed-out' });
    }
    if (api.detached) {
      return yield* makeZerospinError({ code: 'node-tab-detached' });
    }
    return yield* Effect.tryPromise({
      try: () => api.clear?.() ?? api.node.clearAuthentication(),
      catch: catchZerospinError({ code: 'node-clearAuthentication-failed' }),
    });
  }).pipe(encodeRpcOutcome);
});
