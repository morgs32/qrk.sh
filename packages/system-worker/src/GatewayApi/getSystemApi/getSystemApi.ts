import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IApiKeyIdentityResolver } from '../../ApiKeyIdentityResolver/ApiKeyIdentityResolver.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { SystemApi } from '../../SystemApi/SystemApi.js';
import { SystemApiFailure } from '../../SystemApi/SystemApiFailure/SystemApiFailure.js';
import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const getSystemApi = Effect.fn('GatewayApi.getSystemApi', {
  root: true,
})(function* (props: {
  apiKeyIdentityResolver: IApiKeyIdentityResolver;
  request: { zerospinSecretKey: string };
  runtime: ISystemRuntime;
  systemRepo: Pick<SystemRepo, 'getActiveGenerationId'>;
}) {
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.validate(
      Schema.Struct({ zerospinSecretKey: Schema.String }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-system-api-props',
        prefix: 'Failed to decode getSystemApi props',
      }),
    );
    const generationId = yield* makeAsync(
      () => props.systemRepo.getActiveGenerationId(),
      cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'gateway-infrastructure-failure',
              message: 'Failed to resolve the active System generation',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    ).pipe(Effect.flatMap(decodeRpc));
    const claims = yield* props.apiKeyIdentityResolver.resolve({
      apiKey: validated.zerospinSecretKey,
    });
    if (claims.keyType !== 'secret') {
      return yield* new ZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'getSystemApi requires a secret key',
      });
    }
    return new SystemApi({
      generationId,
      systemId: claims.systemId,
      systemWorkerName: claims.systemWorkerName,
      runtime: props.runtime,
    });
  }).pipe(
    Effect.catchAll(error => Effect.succeed(new SystemApiFailure(error))),
  );
});
