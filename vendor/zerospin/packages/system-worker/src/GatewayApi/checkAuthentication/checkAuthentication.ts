import { type AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

/*
 * Gateway admission checks the authored authenticator result against the
 * submitted authentication lock and systemName before binding a userId.
 *
 * 1. Read the expected authentication context.
 * 2. Decode the returned user identity.
 * 3. Compare the authentication lock.
 * 4. Compare the authored system name.
 * 5. Return the checked user identity.
 */
export const checkAuthentication = Effect.fn('GatewayApi.checkAuthentication')(
  function* (props: {
    authentication: {
      userId: unknown;
      authenticationLock: unknown;
      systemName: unknown;
    };
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    systemName: string;
  }) {
    // 1 — compare the authenticator result with the submitted lock and systemName
    const { authentication, authenticationLock, systemName } = props;

    // 2 — require a nonempty userId or return authenticated-user-id-invalid
    const userId = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(
      authentication.userId,
    ).pipe(
      mapParseError({
        code: 'authenticated-user-id-invalid',
        prefix: 'SystemWorker returned an invalid userId',
      }),
    );

    // 3 — reject differing serialized authentication locks
    if (
      JSON.stringify(authentication.authenticationLock) !==
      JSON.stringify(authenticationLock)
    ) {
      return yield* new ZerospinError({
        code: 'authentication-lock-mismatch',
        message:
          'SystemWorker returned authentication for a different authentication lock',
      });
    }

    // 4 — reject authentication returned for a different systemName
    if (authentication.systemName !== systemName) {
      return yield* new ZerospinError({
        code: 'authentication-system-name-mismatch',
        message:
          'SystemWorker returned authentication for a different System name',
      });
    }

    // 5 — pass the decoded userId to frontend authorization
    return userId;
  },
);
