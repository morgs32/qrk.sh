import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
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

export const fetchServiceFrontendState = Effect.fn('fetchServiceFrontendState')(
  function* (props: {
    apiUrl: string;
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Effect.fn.Return<
    IServiceFrontendState,
    IAnyError,
    Async | TelemetryCollector
  > {
    const signature = yield* makeAsync(props.generateSignature).pipe(
      Effect.flatMap(decodeRpc),
    );
    const gatewayApi = newSyncRpcSession<GatewayApi>(props.apiUrl);
    const frontendApi = gatewayApi.getServiceFrontendApi({
      publishableKey: props.publishableKey,
      systemName: props.systemName,
      authenticationLock: props.authenticationLock,
      signature,
      serviceName: props.serviceName,
      frontendName: props.frontendName,
      serviceFrontendLock: props.serviceFrontendLock,
    });
    return yield* makeTraceableApiTarget(frontendApi)
      .getState()
      .pipe(
        Effect.mapError(error =>
          error instanceof Error
            ? ZerospinError.catch({ code: 'async-failed' })(error)
            : new ZerospinError(error),
        ),
        Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
      );
  },
  annotateFunctionSpan,
);
