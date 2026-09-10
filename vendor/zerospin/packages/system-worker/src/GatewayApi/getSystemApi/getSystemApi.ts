import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { SystemApi } from '../../SystemApi/SystemApi.js';
import { SystemApiFailure } from '../../SystemApi/SystemApiFailure/SystemApiFailure.js';
import { checkSecretApiKey } from '../checkSecretApiKey/checkSecretApiKey.js';

/*
 * GatewayApi grants the deployment-scoped SystemApi to secret-key callers.
 * Admission errors become a failure capability with the same callable surface.
 *
 * 1. Capture the request and runtime.
 * 2. Decode the secret-key request.
 * 3. Check deployment credentials.
 * 4. Bind the system capability.
 */
export const getSystemApi = Effect.fn('GatewayApi.getSystemApi', {
  root: true,
})(function* (props: {
  request: { zerospinSecretKey: string };
  runtime: ISystemRuntime;
}) {
  // 1 — keep the secret-key request and capability runtime
  const { request, runtime } = props;
  return yield* Effect.gen(function* () {
    // 2 — reject fields outside zerospinSecretKey
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(Schema.Struct({ zerospinSecretKey: Schema.String })),
    )(request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-system-api-props',
        prefix: 'Failed to decode getSystemApi props',
      }),
    );

    // 3 — apply development or production secret-key policy
    yield* checkSecretApiKey(validated.zerospinSecretKey);

    // 4 — take systemId from ZEROSPIN_SYSTEM_ID
    return new SystemApi({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      runtime,
    });
  }).pipe(Effect.catch(error => Effect.succeed(new SystemApiFailure(error))));
});
