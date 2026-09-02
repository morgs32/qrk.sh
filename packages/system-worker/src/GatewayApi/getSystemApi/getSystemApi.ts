import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { SystemApi } from '../../SystemApi/SystemApi.js';
import { SystemApiFailure } from '../../SystemApi/SystemApiFailure/SystemApiFailure.js';
import { checkSecretApiKey } from '../checkSecretApiKey/checkSecretApiKey.js';

export const getSystemApi = Effect.fn('GatewayApi.getSystemApi', {
  root: true,
})(function* (props: {
  request: { zerospinSecretKey: string };
  runtime: ISystemRuntime;
}) {
  const { request, runtime } = props;
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(Schema.Struct({ zerospinSecretKey: Schema.String })),
    )(request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-system-api-props',
        prefix: 'Failed to decode getSystemApi props',
      }),
    );
    yield* checkSecretApiKey(validated.zerospinSecretKey);
    return new SystemApi({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      runtime,
    });
  }).pipe(Effect.catch(error => Effect.succeed(new SystemApiFailure(error))));
});
