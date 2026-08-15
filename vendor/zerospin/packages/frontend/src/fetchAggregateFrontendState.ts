import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';

import type { authenticate } from './authenticate';

export const fetchAggregateFrontendState: (props: {
  frontendApi: Awaited<
    ReturnType<
      Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi']['getAggregateFrontendApi']
    >
  >;
}) => Effect.Effect<
  IAggregateFrontendSyncState,
  IAnyError,
  TelemetryCollector
> = Effect.fn('fetchAggregateFrontendState')(function* (props: {
  frontendApi: Awaited<
    ReturnType<
      Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi']['getAggregateFrontendApi']
    >
  >;
}): Effect.fn.Return<
  IAggregateFrontendSyncState,
  IAnyError,
  TelemetryCollector
> {
  return yield* makeTraceableApiTarget(props.frontendApi)
    .getState()
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
    );
}, annotateFunctionSpan);
