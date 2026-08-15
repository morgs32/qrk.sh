import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { Effect, type Schema } from 'effect';

export const getAuthentication = Effect.fn(
  'AuthenticatedApi.getAuthentication',
)(
  (props: {
    authentication: {
      readonly authenticationLock: Schema.Schema.Type<
        typeof AuthenticationLockSchema
      >;
      readonly systemId: ISystemId;
      readonly systemName: string;
      readonly systemVersion: string;
      readonly userId: string;
    };
  }) =>
    encodeRpc(
      Effect.succeed({
        authenticationLock: props.authentication.authenticationLock,
        systemId: props.authentication.systemId,
        systemName: props.authentication.systemName,
        systemVersion: props.authentication.systemVersion,
        userId: props.authentication.userId,
      }),
    ),
);
