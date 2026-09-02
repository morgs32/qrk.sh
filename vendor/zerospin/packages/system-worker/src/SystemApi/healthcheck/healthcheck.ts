import { Effect, Schema, type Context } from 'effect';

import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const healthcheck = Effect.fn('SystemApi.healthcheck')(
  function* (props: {
    request: Parameters<SystemApi['healthcheck']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { authResults, request } = props;
    return yield* makeApiHandler({
      name: 'SystemApi.healthcheck',
      argsSchema: Schema.mutable(Schema.Tuple([])),
      handler: () =>
        Effect.succeed('healthy').pipe(
          Effect.withSpan('SystemApi.healthcheck', { root: true }),
        ),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
