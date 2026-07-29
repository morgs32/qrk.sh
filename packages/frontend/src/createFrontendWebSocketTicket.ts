import type { IAccountId, IActorId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import type { newWebSocketRpcSession } from 'capnweb';
import { Effect } from 'effect';

export const createFrontendWebSocketTicket = Effect.fn(
  'createFrontendWebSocketTicket',
)(function* (props: {
  frontendApi: ReturnType<
    ReturnType<typeof newWebSocketRpcSession<ZerospinApis>>['getFrontendApi']
  >;
}): Effect.fn.Return<
  {
    ticket: string;
    systemId: ISystemId;
    generationId: string;
    accountId: IAccountId;
    accountName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
  },
  IAnyError,
  TelemetryCollector
> {
  return yield* makeTraceableApiTarget(props.frontendApi)
    .createFrontendWebSocketTicket()
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
    );
}, annotateFunctionSpan);
