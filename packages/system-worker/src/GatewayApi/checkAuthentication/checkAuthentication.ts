import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

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
    const { authentication, authenticationLock, systemName } = props;
    const userId = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(
      authentication.userId,
    ).pipe(
      mapParseError({
        code: 'authenticated-user-id-invalid',
        prefix: 'SystemWorker returned an invalid userId',
      }),
    );
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
    if (authentication.systemName !== systemName) {
      return yield* new ZerospinError({
        code: 'authentication-system-name-mismatch',
        message:
          'SystemWorker returned authentication for a different System name',
      });
    }
    return userId;
  },
);
