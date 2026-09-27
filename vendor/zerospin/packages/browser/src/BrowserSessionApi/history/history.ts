import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const history = Effect.fn('BrowserSessionApi.history')(
  function* (props: { api: BrowserSessionApi; input: unknown }) {
    const { api, input } = props;
    return yield* Effect.gen(function* () {
      if (api.detached) {
        return yield* makeZerospinError({ code: 'node-tab-detached' });
      }
      const page = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          afterNodeIndex: Schema.Number.check(
            Schema.isInt(),
            Schema.isGreaterThanOrEqualTo(0),
          ),
          limit: Schema.Number.check(
            Schema.isInt(),
            Schema.isBetween({ minimum: 1, maximum: 200 }),
          ),
        }),
      )(input, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'node-history-page-invalid',
          prefix: 'Invalid node history page',
        }),
      );
      return yield* Effect.tryPromise({
        try: () => api.node.history(page),
        catch: catchZerospinError({ code: 'node-history-failed' }),
      });
    }).pipe(encodeRpcOutcome);
  },
);
