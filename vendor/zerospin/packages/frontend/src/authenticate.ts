import type { Async } from '@zerospin/core/async/Async';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { newWebSocketRpcSession, type RpcStub } from 'capnweb';
import { Effect, Redacted, type Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

export const authenticate = Effect.fn('authenticate')(function* (props: {
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature: () => Effect.Effect<unknown, IAnyError, Async>;
}): Effect.fn.Return<
  Readonly<{
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    systemId: ISystemId;
    systemName: string;
    systemVersion: string;
    userId: string;
    authenticatedApi: Awaited<
      ReturnType<RpcStub<GatewayApi>['getAuthenticatedApi']>
    >;
    releaseAuthenticatedApi(): void;
  }>,
  IAnyError,
  Async | PublishableKey | TelemetryCollector | ZerospinApiUrl
> {
  const signature = yield* props.generateSignature();
  const publishableKey = yield* PublishableKey;
  const apiUrl = yield* ZerospinApiUrl;
  const gatewayApi = yield* Effect.try({
    try: () => {
      const webSocketUrl = new URL(apiUrl);
      if (webSocketUrl.protocol === 'http:') {
        webSocketUrl.protocol = 'ws:';
      } else if (webSocketUrl.protocol === 'https:') {
        webSocketUrl.protocol = 'wss:';
      } else {
        throw new Error(
          `Unsupported Zerospin API URL protocol: ${webSocketUrl.protocol}`,
        );
      }
      return newWebSocketRpcSession<GatewayApi>(webSocketUrl.href);
    },
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'user-authentication-transport-failed',
            message: 'Failed to open the Zerospin user capability transport',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
  const authenticatedApi = yield* Effect.tryPromise({
    try: async () =>
      await gatewayApi.getAuthenticatedApi({
        publishableKey: Redacted.value(publishableKey),
        authenticationLock: props.authenticationLock,
        signature,
      }),
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'user-authentication-transport-failed',
            message: 'Failed to authenticate the Zerospin user',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  }).pipe(
    Effect.onError(() => Effect.sync(() => gatewayApi[Symbol.dispose]())),
  );
  const authentication = yield* Effect.tryPromise({
    try: async () => await authenticatedApi.getAuthentication(),
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'user-authentication-transport-failed',
            message: 'Failed to read the authenticated Zerospin identity',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  }).pipe(
    Effect.flatMap(decodeRpc),
    Effect.onError(() => Effect.sync(() => gatewayApi[Symbol.dispose]())),
  );

  let released = false;
  return {
    authenticationLock: authentication.authenticationLock,
    systemId: authentication.systemId,
    systemName: authentication.systemName,
    systemVersion: authentication.systemVersion,
    userId: authentication.userId,
    authenticatedApi,
    releaseAuthenticatedApi() {
      if (released) return;
      released = true;
      gatewayApi[Symbol.dispose]();
    },
  };
}, annotateFunctionSpan);
