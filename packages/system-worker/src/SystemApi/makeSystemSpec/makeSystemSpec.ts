import { Effect, Schema, type Context } from 'effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi returns the authored deployment spec for inspection callers.
 *
 * 1. Capture the capability and request.
 * 2. Validate the empty argument tuple.
 * 3. Run the requested operation.
 */
export const makeSystemSpec = Effect.fn('SystemApi.makeSystemSpec')(
  function* (props: {
    request: Parameters<SystemApi['makeSystemSpec']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    // 1 — provide the bound SystemApiAuthResults to the handler
    const { authResults, request } = props;

    // 2 — encode the result and collect telemetry through makeApiHandler
    return yield* makeApiHandler({
      name: 'SystemApi.makeSystemSpec',
      argsSchema: Schema.mutable(Schema.Tuple([])),
      persistTelemetry: false,
      handler: () =>
        Effect.gen(function* () {
          // 3 — serialize the static authored system through getSystemSpec
          return yield* getSystemSpec();
        }).pipe(Effect.withSpan('SystemApi.makeSystemSpec', { root: true })),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
