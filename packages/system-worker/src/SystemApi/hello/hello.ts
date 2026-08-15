import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const hello = Effect.fn('SystemApi.hello')(function* (props: {
  request: Parameters<SystemApi['hello']>[0];
  authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
}) {
  return yield* makeApiHandler({
    name: 'SystemApi.hello',
    argsSchema: Schema.mutable(Schema.Tuple()),
    handler: () =>
      Effect.gen(function* () {
        const authResults = yield* SystemApiAuthResults;
        const systemWorker = yield* SystemWorkerApi;
        return yield* makeAsync(() =>
          systemWorker.hello({
            generationId: authResults.generationId,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.withSpan('SystemApi.hello', { root: true })),
  })(props.request).pipe(
    Effect.provideService(SystemApiAuthResults, props.authResults),
  );
});
