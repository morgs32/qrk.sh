import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import type { newWebSocketRpcSession } from 'capnweb';
import { Effect } from 'effect';

export const fetchServiceFrontendState = Effect.fn(
  'fetchServiceFrontendState',
)(function* (props: {
  frontendApi: Awaited<
    ReturnType<
      ReturnType<
        typeof newWebSocketRpcSession<ZerospinApis>
      >['getServiceFrontendApi']
    >
  >['frontendApi'];
}): Effect.fn.Return<
  IServiceFrontendState,
  IAnyError,
  TelemetryCollector
> {
  return yield* makeTraceableApiTarget(props.frontendApi)
    .getFrontendState()
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
    );
}, annotateFunctionSpan);
