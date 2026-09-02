import { Effect, Schema, type Context } from 'effect';

import { executeServiceQuery as executeSystemWorkerServiceQuery } from '../../executeServiceQuery/executeServiceQuery.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const executeServiceQuery = Effect.fn('SystemApi.executeServiceQuery')(
  function* (props: {
    request: Parameters<SystemApi['executeServiceQuery']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { request, authResults } = props;
    return yield* makeApiHandler({
      name: 'SystemApi.executeServiceQuery',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            serviceName: Schema.String,
            queryName: Schema.String,
            params: Schema.Unknown,
          }),
        ]),
      ),
      handler: handlerProps =>
        Effect.gen(function* () {
          const { params, queryName, serviceName } = handlerProps;
          return yield* executeSystemWorkerServiceQuery({
            params,
            queryName,
            serviceName,
          });
        }).pipe(
          Effect.withSpan('SystemApi.executeServiceQuery', { root: true }),
        ),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
