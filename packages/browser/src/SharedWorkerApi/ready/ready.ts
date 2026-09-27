import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SharedWorkerApi } from '../SharedWorkerApi.ts';

export const ready = Effect.fn('SharedWorkerApi.ready')(function* (props: {
  api: SharedWorkerApi;
}) {
  return yield* Effect.tryPromise({
    try: () => props.api.runtime.ready(),
    catch: catchZerospinError({ code: 'node-storage-unavailable' }),
  }).pipe(encodeRpcOutcome);
});
