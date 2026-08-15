import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getSystemRepos = Effect.fn('SystemApi.getSystemRepos')(
  function* (props: {
    request: Parameters<SystemApi['getSystemRepos']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.getSystemRepos',
      argsSchema: Schema.mutable(Schema.Tuple()),
      handler: () =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemWorker = yield* SystemWorkerApi;
          const encoded = yield* makeAsync(() =>
            systemWorker.getSystemRepos({
              generationId: authResults.generationId,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(Effect.withSpan('SystemApi.getSystemRepos', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
