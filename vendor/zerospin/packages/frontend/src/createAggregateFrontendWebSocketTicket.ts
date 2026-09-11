import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
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

export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'createAggregateFrontendWebSocketTicket',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{ ticket: string }>,
  IAnyError,
  Async | TelemetryCollector
> {
  const {
    aggregateFrontendLock,
    aggregateName,
    apiUrl,
    frontendName,
    generateSignature,
    publishableKey,
    systemName,
  } = props;
  const signature = yield* makeAsync(generateSignature).pipe(
    Effect.flatMap(decodeRpc),
  );
  const gatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
  const frontendApi = gatewayApi.getAggregateFrontendApi({
    aggregateVersion: props.aggregateVersion,
    publishableKey,
    systemName,
    signature,
    aggregateName,
    frontendName,
    aggregateFrontendLock,
  });
  return yield* makeTraceableApiTarget(frontendApi)
    .createWebSocketTicket({ aggregateVersion: props.aggregateVersion })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
      Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
    );
}, annotateFunctionSpan);
