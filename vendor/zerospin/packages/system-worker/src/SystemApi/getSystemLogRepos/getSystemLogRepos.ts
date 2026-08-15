import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getSystemLogRepos = Effect.fn('SystemApi.getSystemLogRepos')(
  function* (props: {
    request: Parameters<SystemApi['getSystemLogRepos']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.getSystemLogRepos',
      argsSchema: Schema.mutable(Schema.Tuple()),
      handler: () =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemWorker = yield* SystemWorkerApi;
          const encoded = yield* makeAsync(() =>
            systemWorker.getSystemLogRepos({
              generationId: authResults.generationId,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(Effect.withSpan('SystemApi.getSystemLogRepos', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
