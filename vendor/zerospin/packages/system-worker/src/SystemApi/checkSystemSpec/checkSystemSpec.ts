import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Schema, type Context } from 'effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/** Serialize this executing Worker, even when SystemRepo runs another deployed version. */
export const checkSystemSpec = Effect.fn('SystemApi.checkSystemSpec')(
  function* (props: {
    request: Parameters<SystemApi['checkSystemSpec']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    const { authResults, request } = props;
    return yield* makeApiHandler({
      name: 'SystemApi.checkSystemSpec',
      argsSchema: Schema.mutable(Schema.Tuple([])),
      persistTelemetry: false,
      handler: () =>
        Effect.gen(function* () {
          const spec = yield* getSystemSpec();
          const systemRepo = yield* SystemRepo.getRepo({
            key: { systemId: authResults.systemId },
          });
          return yield* makeAsync(() =>
            systemRepo.checkSystemSpec({ spec }),
          ).pipe(Effect.flatMap(decodeRpc));
        }),
    })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
  },
);
