import { type Async } from '@zerospin/core/async/Async';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import type {
  IFrontendState,
  ISession,
} from '@zerospin/core/session/types';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Redacted } from 'effect';

export const fetchFrontendState = Effect.fn('fetchFrontendState')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
}): Effect.fn.Return<
  IFrontendState,
  IAnyError,
  ZerospinApisUrl | PublishableKey | TelemetryCollector | Async
> {
  const { session } = props;

  const publishableKey = yield* PublishableKey;
  const signature = yield* session.generateSignature();
  const apiUrl = yield* ZerospinApisUrl;

  using apis = newSyncRpcSession<ZerospinApis>(apiUrl);
  const client = makeTraceableApiTarget(
    apis.getFrontendApi({
      publishableKey: Redacted.value(publishableKey),
      accountName: session.frontend.accountName,
      actorName: session.frontend.actorName,
      frontendName: session.frontend.frontendName,
      signature,
    }),
  );
  const frontendState = yield* client.getFrontendState().pipe(
    Effect.mapError(error =>
      error instanceof Error
        ? ZerospinError.catch({ code: 'async-failed' })(error)
        : new ZerospinError(error),
    ),
  );

  return frontendState;
}, annotateFunctionSpan);
