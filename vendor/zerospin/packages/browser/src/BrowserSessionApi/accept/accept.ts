import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { NodeCommandInputSchema } from '../../Node/NodeCommandInputSchema.ts';
import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const accept = Effect.fn('BrowserSessionApi.accept')(function* (props: {
  api: BrowserSessionApi;
  input: unknown;
}) {
  const { api, input } = props;
  return yield* Effect.gen(function* () {
    if (!api.isCurrent()) {
      return yield* makeZerospinError({ code: 'node-signed-out' });
    }
    if (api.detached) {
      return yield* makeZerospinError({ code: 'node-tab-detached' });
    }
    const command = yield* Schema.decodeUnknownEffect(NodeCommandInputSchema)(
      input,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'node-command-invalid',
        prefix: 'Invalid node command',
      }),
    );
    return yield* Effect.tryPromise({
      try: async () => {
        const accepted = await api.node.accept(command);
        void api.synchronization?.push().catch(() => undefined);
        return accepted;
      },
      catch: catchZerospinError({ code: 'node-acceptance-failed' }),
    });
  }).pipe(encodeRpcOutcome);
});
