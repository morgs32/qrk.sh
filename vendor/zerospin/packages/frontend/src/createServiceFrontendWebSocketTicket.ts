import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, type Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'createServiceFrontendWebSocketTicket',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{ ticket: string }>,
  IAnyError,
  Async | TelemetryCollector
> {
  const {
    apiUrl,
    authenticationLock,
    frontendName,
    generateSignature,
    publishableKey,
    serviceFrontendLock,
    serviceName,
    systemName,
  } = props;
  const signature = yield* makeAsync(generateSignature).pipe(
    Effect.flatMap(decodeRpc),
  );
  const gatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
  const frontendApi = gatewayApi.getServiceFrontendApi({
    serviceVersion: props.serviceVersion,
    publishableKey,
    systemName,
    authenticationLock,
    signature,
    serviceName,
    frontendName,
    serviceFrontendLock,
  });
  return yield* makeTraceableApiTarget(frontendApi)
    .createWebSocketTicket({ serviceVersion: props.serviceVersion })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
      Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
    );
}, annotateFunctionSpan);
