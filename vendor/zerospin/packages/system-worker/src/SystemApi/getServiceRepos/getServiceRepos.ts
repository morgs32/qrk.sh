import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getServiceRepos = Effect.fn('SystemApi.getServiceRepos')(
  function* (props: {
    request: Parameters<SystemApi['getServiceRepos']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.getServiceRepos',
      argsSchema: Schema.mutable(Schema.Tuple()),
      handler: () =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemWorker = yield* SystemWorkerApi;
          const encoded = yield* makeAsync(() =>
            systemWorker.getServiceRepos({
              generationId: authResults.generationId,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(Effect.withSpan('SystemApi.getServiceRepos', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
