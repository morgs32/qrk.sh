import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IFrontendDelta } from '@zerospin/core/session/types';
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

export const pushAggregateFrontendCommand = Effect.fn(
  'pushAggregateFrontendCommand',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  command: IEncodedCommand<
    IChainedCommand<ISessionCommand, IFrontendDelta> &
      Readonly<{ sessionIndex: number; pushIndex: null }>
  >;
}): Effect.fn.Return<
  Readonly<{ aggregateIndex: number; commandId: string }>,
  IAnyError,
  Async | TelemetryCollector
> {
  const {
    aggregateFrontendLock,
    aggregateName,
    apiUrl,
    command,
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
    .pushCommand({ command })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
      Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
    );
}, annotateFunctionSpan);
