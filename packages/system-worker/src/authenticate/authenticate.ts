import type { Async } from '@zerospin/core/async/Async';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { IAuthentication } from '@zerospin/core/authentication/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import { system } from 'system';

/*
 * Frontend capability admission invokes the authored authentication program.
 * This boundary validates the requested authentication definition and returns the
 * authenticated userId with the matching lock and authored system identity.
 *
 * 1. Read the submitted signature context.
 * 2. Find the requested authentication definition.
 * 3. Reject unavailable or changed definitions.
 * 4. Decode and authenticate the signature.
 * 5. Validate and return the authenticated identity.
 */
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
  }>,
  IAnyError,
  Async
> {
  // 1 — separate the lock from the untrusted signature value
  const { authenticationLock, signature: requestedSignature } = props;

  // 2 — select exactly the requested independent authentication version
  const definition: IAuthentication | undefined = system.authentication.find(
    definition => definition.version === authenticationLock.version,
  );

  // 3 — compare the entire authored definition with the frontend lock
  if (
    definition === undefined ||
    !isEqual(definition.spec, authenticationLock)
  ) {
    return yield* new ZerospinError({
      code: 'authentication-lock-unsupported',
      message: `Authentication version ${authenticationLock.version} is unavailable or changed`,
    });
  }

  // 4 — decode and run this version's authored authentication program
  const signature = yield* Schema.decodeUnknownEffect(definition.signature)(
    requestedSignature,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'authentication-signature-invalid',
      prefix: `Failed to decode authentication signature version "${definition.version}"`,
    }),
  );
  const returnedUserId = yield* definition.authenticate({ signature });

  // 5 — require a nonempty userId before returning the lock and system metadata
  const userId = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(
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
  };
});
