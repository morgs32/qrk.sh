import { makeAsync } from '@zerospin/core/async/makeAsync';
import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IApiKeyIdentityResolver } from '../../ApiKeyIdentityResolver/ApiKeyIdentityResolver.js';
import { AuthenticatedApi } from '../../AuthenticatedApi/AuthenticatedApi.js';
import { AuthenticatedApiFailure } from '../../AuthenticatedApi/AuthenticatedApiFailure/AuthenticatedApiFailure.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { SystemWorkerResolver } from '../../SystemWorkerResolver/SystemWorkerResolver.js';

export const getAuthenticatedApi = Effect.fn('GatewayApi.getAuthenticatedApi', {
  root: true,
})(function* (props: {
  apiKeyIdentityResolver: IApiKeyIdentityResolver;
  request: {
    publishableKey: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
  };
  runtime: ISystemRuntime;
  systemRepo: Pick<SystemRepo, 'getActiveGenerationId'>;
}) {
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.validate(
      Schema.Struct({
        publishableKey: Schema.String,
        authenticationLock: Schema.Unknown,
        signature: Schema.Unknown,
      }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-authenticated-api-props',
        prefix: 'Failed to decode getAuthenticatedApi arguments',
      }),
    );
    const authenticationLock = yield* Schema.decodeUnknown(
      AuthenticationLockSchema,
    )(validated.authenticationLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authentication-lock-invalid',
        prefix: 'getAuthenticatedApi received an invalid authentication lock',
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
      apiKey: validated.publishableKey,
    });
    if (claims.keyType !== 'publishable') {
      return yield* new ZerospinError({
        code: 'secret-key-not-allowed',
        message: 'getAuthenticatedApi requires a publishable key',
      });
    }
    const resolver = yield* SystemWorkerResolver;
    const systemWorker = resolver.get({
      systemWorkerName: claims.systemWorkerName,
    });
    return yield* Effect.gen(function* () {
      const authenticated = yield* makeAsync(
        () =>
          systemWorker.authenticate({
            authenticationLock,
            signature: validated.signature,
          }),
        cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'failed-to-authenticate-user-rpc',
                message:
                  'SystemWorker.authenticate threw while creating AuthenticatedApi',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      ).pipe(Effect.flatMap(decodeRpc));
      const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
        authenticated.userId,
      ).pipe(
        mapParseError({
          code: 'authenticated-user-id-invalid',
          prefix: 'SystemWorker returned an invalid userId',
        }),
      );
      if (
        JSON.stringify(authenticated.authenticationLock) !==
        JSON.stringify(authenticationLock)
      ) {
        return yield* new ZerospinError({
          code: 'authentication-lock-mismatch',
          message:
            'SystemWorker returned authentication for a different authentication lock',
        });
      }
      return new AuthenticatedApi({
        authentication: {
          authenticationLock,
          generationId,
          systemId: claims.systemId,
          systemName: authenticated.systemName,
          systemVersion: authenticated.systemVersion,
          systemWorkerName: claims.systemWorkerName,
          userId,
        },
        runtime: props.runtime,
      });
    }).pipe(Effect.ensuring(Effect.sync(() => systemWorker[Symbol.dispose]())));
  }).pipe(
    Effect.catchAll(error =>
      Effect.succeed(new AuthenticatedApiFailure(error)),
    ),
  );
});
