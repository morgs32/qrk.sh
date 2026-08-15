import type {
  IEncodedCommand,
  IPushBlock,
  IStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';

import type { authenticate } from './authenticate';

export const pushAggregateFrontendCommands = Effect.fn(
  'pushAggregateFrontendCommands',
)(function* (props: {
  frontendApi: Awaited<
    ReturnType<
      Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi']['getAggregateFrontendApi']
    >
  >;
  commands: readonly IEncodedCommand<IStagedReplicaCommand>[];
}): Effect.fn.Return<IPushBlock, IAnyError, TelemetryCollector> {
  return yield* makeTraceableApiTarget(props.frontendApi)
    .pushCommands({ commands: props.commands })
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
    );
}, annotateFunctionSpan);
