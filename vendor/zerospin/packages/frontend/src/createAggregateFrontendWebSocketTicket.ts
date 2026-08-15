import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';

import type { authenticate } from './authenticate';

export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'createAggregateFrontendWebSocketTicket',
)(function* (props: {
  frontendApi: Awaited<
    ReturnType<
      Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi']['getAggregateFrontendApi']
    >
  >;
}): Effect.fn.Return<
  {
    ticket: string;
  },
  IAnyError,
  TelemetryCollector
> {
  return yield* makeTraceableApiTarget(props.frontendApi)
    .createWebSocketTicket()
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
    );
}, annotateFunctionSpan);
