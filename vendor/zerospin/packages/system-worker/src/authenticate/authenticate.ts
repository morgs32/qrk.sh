import type { Async } from '@zerospin/core/async/Async';
import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import { system } from 'system';

export const authenticate = Effect.fn('SystemWorker.authenticate', {
  root: true,
})(function* (props: {
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  signature: unknown;
}): Effect.fn.Return<
  Readonly<{
    userId: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    systemName: string;
    systemVersion: string;
  }>,
  IAnyError,
  Async
> {
  const authenticationLock = yield* Schema.decodeUnknown(
    AuthenticationLockSchema,
  )(props.authenticationLock, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'authentication-lock-invalid',
      prefix: 'Failed to decode the requested authentication lock',
    }),
  );
  const signatureDefinition =
    authenticationLock.signature.version ===
    system.authentication.signature.version
      ? {
          version: system.authentication.signature.version,
          schemaJsonSchema:
            system.authentication.signature.spec.schemaJsonSchema,
        }
      : system.authentication.signature.spec.historicalDefinitions.find(
          definition =>
            definition.version === authenticationLock.signature.version,
        );
  if (
    signatureDefinition === undefined ||
    !isEqual(signatureDefinition, authenticationLock.signature)
  ) {
    return yield* new ZerospinError({
      code: 'authentication-lock-unsupported',
      message: `Authentication signature ${authenticationLock.signature.version} is unavailable or changed`,
    });
  }
  const signature =
    yield* system.authentication.signature.decodeAndAdaptSignature({
      version: authenticationLock.signature.version,
      signature: props.signature,
    });
  const returnedUserId = yield* system.authentication.authenticate({
    signature,
  });
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    returnedUserId,
  ).pipe(
    mapParseError({
      code: 'system-runtime-authentication-user-invalid',
      prefix: 'The static System returned an invalid authenticated userId',
    }),
  );
  return {
    userId,
    authenticationLock,
    systemName: system.name,
    systemVersion: system.version,
  };
});
