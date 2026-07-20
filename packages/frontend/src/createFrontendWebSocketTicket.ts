import type { Async } from '@zerospin/core/async/Async';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import type { ISession } from '@zerospin/core/session/types';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Redacted } from 'effect';

export const createFrontendWebSocketTicket = Effect.fn(
  'createFrontendWebSocketTicket',
)(function* <FRONTEND extends IFrontendController>(props: {
  session: ISession<FRONTEND>;
}): Effect.fn.Return<
  string,
  IAnyError,
  Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
> {
  const publishableKey = yield* PublishableKey;
  const signature = yield* props.session.generateSignature();
  const apiUrl = yield* ZerospinApisUrl;

  using apis = newSyncRpcSession<ZerospinApis>(apiUrl);
  const frontendApi = makeTraceableApiTarget(
    apis.getFrontendApi({
      publishableKey: Redacted.value(publishableKey),
      accountName: props.session.frontend.accountName,
      actorName: props.session.frontend.actorName,
      frontendName: props.session.frontend.frontendName,
      signature,
    }),
  );

  return yield* frontendApi
    .createFrontendWebSocketTicket()
    .pipe(
      Effect.mapError(error =>
        error instanceof Error
          ? ZerospinError.catch({ code: 'async-failed' })(error)
          : new ZerospinError(error),
      ),
    );
}, annotateFunctionSpan);
