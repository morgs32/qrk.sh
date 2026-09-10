import { Effect, Schema, type Context } from 'effect';

import { executeServiceQuery as executeSystemWorkerServiceQuery } from '../../executeServiceQuery/executeServiceQuery.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi exposes named authored service queries to secret-key callers.
 * The worker query path resolves and executes the query in its owning service.
 *
 * 1. Capture the capability and request.
 * 2. Validate the named query request.
 * 3. Run the owner-local service query.
 */
export const executeServiceQuery = Effect.fn('SystemApi.executeServiceQuery')(
  function* (props: {
    request: Parameters<SystemApi['executeServiceQuery']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    // 1 — retain SystemApiAuthResults for the shared handler
    const { request, authResults } = props;

    // 2 — decode serviceName, queryName, and params
    return yield* makeApiHandler({
      name: 'SystemApi.executeServiceQuery',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            serviceName: Schema.String,
            serviceVersion: Schema.String,
            queryName: Schema.String,
            params: Schema.Unknown,
          }),
        ]),
      ),
      handler: handlerProps =>
        Effect.gen(function* () {
          const { params, queryName, serviceName, serviceVersion } =
            handlerProps;

          // 3 — forward the decoded arguments into executeSystemWorkerServiceQuery
          return yield* executeSystemWorkerServiceQuery({
            serviceVersion,
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
