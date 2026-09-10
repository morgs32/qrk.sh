import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema, type Context } from 'effect';

import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import type { SystemApi } from '../SystemApi.js';

/*
 * SystemApi asks the configured SystemRepo to initialize its catalog chains.
 *
 * 1. Capture the capability and request.
 * 2. Validate the empty argument tuple.
 * 3. Run the requested operation.
 */
export const initialize = Effect.fn('SystemApi.initialize')(function* (props: {
  request: Parameters<SystemApi['initialize']>[0];
  authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
}) {
  // 1 — provide the bound SystemApiAuthResults to the handler
  const { authResults, request } = props;

  // 2 — encode the result and collect telemetry through makeApiHandler
  return yield* makeApiHandler({
    name: 'SystemApi.initialize',
    argsSchema: Schema.mutable(Schema.Tuple([])),
    handler: () =>
      Effect.gen(function* () {
        const systemRepo = yield* SystemRepo.getRepo({
          key: { systemId: env.ZEROSPIN_SYSTEM_ID },
        });

        // 3 — map a rejected initialize RPC to system-api-initialize-failed
        return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
          () => systemRepo.initialize(),
          ZerospinError.catch({
            code: 'system-api-initialize-failed',
            message: 'Failed to initialize SystemRepo catalog chains',
          }),
        ).pipe(
          Effect.flatMap(decodeRpc),
          Effect.withSpan('SystemApi.initialize', { root: true }),
        );
      }),
  })(request).pipe(Effect.provideService(SystemApiAuthResults, authResults));
});
