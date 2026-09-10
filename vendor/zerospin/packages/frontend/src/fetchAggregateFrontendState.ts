import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
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

export const fetchAggregateFrontendState = Effect.fn(
  'fetchAggregateFrontendState',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  outstandingCommandIds: readonly string[];
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<
  IAggregateFrontendSyncState,
  IAnyError,
  Async | TelemetryCollector
> {
  const {
    aggregateFrontendLock,
    aggregateId,
    aggregateName,
    apiUrl,
    authenticationLock,
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
    authenticationLock,
    signature,
    aggregateId,
    aggregateName,
    frontendName,
    aggregateFrontendLock,
  });
  return yield* makeTraceableApiTarget(frontendApi)
    .getState({ outstandingCommandIds: props.outstandingCommandIds })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
      Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
    );
}, annotateFunctionSpan);
