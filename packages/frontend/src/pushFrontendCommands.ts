import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import type { newWebSocketRpcSession } from 'capnweb';
import { Effect } from 'effect';

export const pushFrontendCommands = Effect.fn('pushFrontendCommands')(
  function* (props: {
    frontendApi: ReturnType<
      ReturnType<
        typeof newWebSocketRpcSession<ZerospinApis>
      >['getFrontendApi']
    >;
    commands: readonly IEncodedCommand<IStagedCommand>[];
  }): Effect.fn.Return<
    Readonly<{
      pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
      pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
      failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
    }>,
    IAnyError,
    TelemetryCollector
  > {
    return yield* makeTraceableApiTarget(props.frontendApi)
      .pushCommands({ commands: props.commands })
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
