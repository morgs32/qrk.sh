import type { IAnyActorApi } from '@zerospin/core/actorController/types';
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
import { Effect, Redacted, type Schema } from 'effect';

export const executeActorQuery = Effect.fn('executeActorQuery')(
  function* <
    ACTOR extends {
      name: string;
      api: IAnyActorApi;
    },
    FRONTEND extends IFrontendController<string, ACTOR['name']>,
    QUERY_NAME extends keyof ACTOR['api'] & string,
  >(props: {
    session: ISession<FRONTEND>;
    queryName: QUERY_NAME;
    params: Schema.Schema.Type<ACTOR['api'][QUERY_NAME]['paramsSchema']>;
  }): Effect.fn.Return<
    ReturnType<ACTOR['api'][QUERY_NAME]['query']> extends Effect.Effect<
      infer SUCCESS,
      infer _ERROR,
      infer _CONTEXT
    >
      ? SUCCESS
      : never,
    IAnyError,
    Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
  > {
    const { params, queryName, session } = props;
    const publishableKey = yield* PublishableKey;
    const apiUrl = yield* ZerospinApisUrl;
    const signature = yield* session.generateSignature();

    using apis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const frontendApi = makeTraceableApiTarget(
      apis.getFrontendApi({
        publishableKey: Redacted.value(publishableKey),
        accountName: session.frontend.accountName,
        actorName: session.frontend.actorName,
        frontendName: session.frontend.frontendName,
        signature,
      }),
    );

    return yield* frontendApi
      .executeActorQuery({
        queryName,
        params,
      })
      .pipe(
        Effect.map(
          result =>
            result as ReturnType<
              ACTOR['api'][QUERY_NAME]['query']
            > extends Effect.Effect<
              infer SUCCESS,
              infer _ERROR,
              infer _CONTEXT
            >
              ? SUCCESS
              : never,
        ),
        Effect.mapError(error =>
          error instanceof Error
            ? ZerospinError.catch({ code: 'async-failed' })(error)
            : new ZerospinError(error),
        ),
      );
  },
  annotateFunctionSpan,
);
