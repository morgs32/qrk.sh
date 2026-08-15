import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';

import type { authenticate } from './authenticate';

export const fetchServiceFrontendState: (props: {
  frontendApi: Awaited<
    ReturnType<
      Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi']['getServiceFrontendApi']
    >
  >;
}) => Effect.Effect<IServiceFrontendState, IAnyError, TelemetryCollector> =
  Effect.fn('fetchServiceFrontendState')(function* (props: {
    frontendApi: Awaited<
      ReturnType<
        Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']['getServiceFrontendApi']
      >
    >;
  }): Effect.fn.Return<IServiceFrontendState, IAnyError, TelemetryCollector> {
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
