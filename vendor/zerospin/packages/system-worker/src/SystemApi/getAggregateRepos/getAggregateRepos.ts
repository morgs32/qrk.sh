import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const getAggregateRepos = Effect.fn('SystemApi.getAggregateRepos')(
  function* (props: {
    request: Parameters<SystemApi['getAggregateRepos']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.getAggregateRepos',
      argsSchema: Schema.mutable(Schema.Tuple()),
      handler: () =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemWorker = yield* SystemWorkerApi;
          const encoded = yield* makeAsync(() =>
            systemWorker.getAggregateRepos({
              generationId: authResults.generationId,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(Effect.withSpan('SystemApi.getAggregateRepos', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
