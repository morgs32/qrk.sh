import { Effect, Schema, type Context } from 'effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

export const makeSystemSpec = Effect.fn('SystemApi.makeSystemSpec')(
  function* (props: {
    request: Parameters<SystemApi['makeSystemSpec']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { authResults, request } = props;
    return yield* makeApiHandler({
      name: 'SystemApi.makeSystemSpec',
      argsSchema: Schema.mutable(Schema.Tuple([])),
      handler: () =>
        Effect.gen(function* () {
          return yield* getSystemSpec();
        }).pipe(Effect.withSpan('SystemApi.makeSystemSpec', { root: true })),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
