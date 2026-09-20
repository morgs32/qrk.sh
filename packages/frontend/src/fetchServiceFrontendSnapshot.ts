import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendSnapshot } from '@zerospin/core/serviceSession/types';
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

export const fetchServiceFrontendSnapshot = Effect.fn('fetchServiceFrontendSnapshot')(
  function* (props: {
    apiUrl: string;
    publishableKey: string;
    systemName: string;
    generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
    serviceName: string;
    serviceVersion: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Effect.fn.Return<
    IServiceFrontendSnapshot,
    IAnyError,
    Async | TelemetryCollector
  > {
    const {
      apiUrl,
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
    const frontendApi = gatewayApi
      .service({
        publishableKey,
        systemName,
        name: serviceName,
        version: props.serviceVersion,
      })
      .authenticate({ signature })
      .authorize({
        frontendName,
        serviceFrontendLock,
      });
    return yield* makeTraceableApiTarget(frontendApi)
      .getSnapshot()
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
