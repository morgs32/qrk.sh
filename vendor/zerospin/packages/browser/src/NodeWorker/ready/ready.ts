import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { NodeWorker } from '../NodeWorker.ts';

export const ready = Effect.fn('NodeWorker.ready')(function* (props: {
  api: NodeWorker;
}) {
  return yield* Effect.tryPromise({
    try: async () => {
      await props.api.host;
    },
    catch: catchZerospinError({ code: 'node-storage-unavailable' }),
  }).pipe(encodeRpcOutcome);
});
