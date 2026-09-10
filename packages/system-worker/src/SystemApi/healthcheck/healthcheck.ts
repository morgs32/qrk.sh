import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * Reports that the granted SystemApi handler is callable.
 *
 * 1. Capture the capability and request.
 * 2. Validate the empty argument tuple.
 * 3. Run the requested operation.
 */
export const healthcheck = Effect.fn('SystemApi.healthcheck')(
  function* (props: {
    request: Parameters<SystemApi['healthcheck']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    // 1 — provide the bound SystemApiAuthResults to the handler
    const { authResults, request } = props;

    // 2 — encode the result and collect telemetry through makeApiHandler
    return yield* makeApiHandler({
      name: 'SystemApi.healthcheck',
      argsSchema: Schema.mutable(Schema.Tuple([])),
      handler: () =>
        // 3 — return the literal healthy through the linked handler
        Effect.succeed('healthy').pipe(
          Effect.withSpan('SystemApi.healthcheck', { root: true }),
        ),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
