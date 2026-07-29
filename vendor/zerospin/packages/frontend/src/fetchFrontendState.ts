import type { IFrontendSyncState } from '@zerospin/core/session/types';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import type { newWebSocketRpcSession } from 'capnweb';
import { Effect } from 'effect';

export const fetchFrontendState = Effect.fn('fetchFrontendState')(
  function* (props: {
    frontendApi: ReturnType<
      ReturnType<
        typeof newWebSocketRpcSession<ZerospinApis>
      >['getFrontendApi']
    >;
  }): Effect.fn.Return<IFrontendSyncState, IAnyError, TelemetryCollector> {
    return yield* makeTraceableApiTarget(props.frontendApi)
      .getFrontendState()
      .pipe(
        Effect.mapError(error =>
          error instanceof Error
            ? ZerospinError.catch({ code: 'async-failed' })(error)
            : new ZerospinError(error),
        ),
      );
  },
  annotateFunctionSpan,
);
