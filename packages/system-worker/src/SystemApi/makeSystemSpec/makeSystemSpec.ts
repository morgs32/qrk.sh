import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const makeSystemSpec = Effect.fn('SystemApi.makeSystemSpec')(
  function* (props: {
    request: Parameters<SystemApi['makeSystemSpec']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.makeSystemSpec',
      generationReadRoute: false,
      argsSchema: Schema.mutable(Schema.Tuple()),
      handler: () =>
        Effect.gen(function* () {
          const systemWorker = yield* SystemWorkerApi;
          return yield* makeAsync(() => systemWorker.getSystemSpec()).pipe(
            Effect.flatMap(decodeRpc),
          );
        }).pipe(Effect.withSpan('SystemApi.makeSystemSpec', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
