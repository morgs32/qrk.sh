import { type Async } from '@zerospin/core/async/Async';
import type { IActor } from '@zerospin/core/actorController/types';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import type { ISession } from '@zerospin/core/session/types';
import type {
  ISystemEnvironmentId,
  ISystemId,
} from '@zerospin/core/system/types';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Redacted } from 'effect';

export const fetchActor = Effect.fn('fetchActor')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
}): Effect.fn.Return<
  {
    actor: IActor;
    deployId: string;
    generationId: string;
    systemId: ISystemId;
    systemVersion: string;
    systemWorkerName: string;
    systemEnvironmentId: ISystemEnvironmentId;
  },
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
  return yield* client.fetchActor().pipe(
    Effect.mapError(error =>
      error instanceof Error
        ? ZerospinError.catch({ code: 'async-failed' })(error)
        : new ZerospinError(error),
    ),
  );
}, annotateFunctionSpan);
