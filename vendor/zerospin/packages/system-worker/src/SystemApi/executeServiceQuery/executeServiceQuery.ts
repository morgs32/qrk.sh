import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
  SystemWorkerApi,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const executeServiceQuery = Effect.fn('SystemApi.executeServiceQuery')(
  function* (props: {
    request: Parameters<SystemApi['executeServiceQuery']>[0];
    authResults: Context.Tag.Service<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.executeServiceQuery',
      argsSchema: Schema.mutable(
        Schema.Tuple(
          Schema.Struct({
            serviceName: Schema.String,
            queryName: Schema.String,
            params: Schema.Unknown,
          }),
        ),
      ),
      handler: props =>
        Effect.gen(function* () {
          const authResults = yield* SystemApiAuthResults;
          const systemWorker = yield* SystemWorkerApi;
          return yield* makeAsync(() =>
            systemWorker.executeServiceQuery({
              generationId: authResults.generationId,
              params: props.params,
              queryName: props.queryName,
              serviceName: props.serviceName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }).pipe(
          Effect.withSpan('SystemApi.executeServiceQuery', { root: true }),
        ),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
