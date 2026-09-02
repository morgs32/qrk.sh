import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IAggregateFrontendPushedCommand,
  IFrontendDelta,
} from '@zerospin/core/session/types';
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
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  aggregateId: IAggregateId;
  aggregateName: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  command: IEncodedCommand<
    IChainedCommand<ISessionCommand, IFrontendDelta> &
      Readonly<{ sessionIndex: number; pushIndex: null }>
  >;
}): Effect.fn.Return<
  IEncodedCommand<IAggregateFrontendPushedCommand>,
  IAnyError,
  Async | TelemetryCollector
> {
  const signature = yield* makeAsync(props.generateSignature).pipe(
    Effect.flatMap(decodeRpc),
  );
  const gatewayApi = newSyncRpcSession<GatewayApi>(props.apiUrl);
  const frontendApi = gatewayApi.getAggregateFrontendApi({
    publishableKey: props.publishableKey,
    systemName: props.systemName,
    authenticationLock: props.authenticationLock,
    signature,
    aggregateId: props.aggregateId,
    aggregateName: props.aggregateName,
    frontendName: props.frontendName,
    aggregateFrontendLock: props.aggregateFrontendLock,
  });
  return yield* makeTraceableApiTarget(frontendApi)
    .pushCommand({ command: props.command })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
      Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
    );
}, annotateFunctionSpan);
