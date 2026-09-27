import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { BrowserNode } from '../BrowserNode.ts';

export const setPushPaused = Effect.fn('BrowserNode.setPushPaused')(
  function* (props: { api: BrowserNode; input: unknown }) {
    const { api, input } = props;
    return yield* Effect.gen(function* () {
      if (api.detached) {
        return yield* makeZerospinError({ code: 'node-tab-detached' });
      }
      const value = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ pushPaused: Schema.Boolean }),
      )(input, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'node-push-state-invalid',
          prefix: 'Invalid node push state',
        }),
      );
      yield* Effect.tryPromise({
        try: async () => {
          await api.node.setPushPaused(value.pushPaused);
          if (!value.pushPaused) {
            void api.synchronization?.push().catch(() => undefined);
          }
        },
        catch: catchZerospinError({ code: 'node-push-state-failed' }),
      });
    }).pipe(encodeRpcOutcome);
  },
);
