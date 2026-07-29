import type { IActor } from '@zerospin/core/actorController/types';
import type { Async } from '@zerospin/core/async/Async';
import type {
  IFrontendController,
  IFrontendControllerSpec,
} from '@zerospin/core/frontendController/types';
import type { IActorId } from '@zerospin/core/models/types';
import {
  PublishableKey as PublishableKeyService,
  type PublishableKey,
} from '@zerospin/core/services/PublishableKey';
import {
  ZerospinApisUrl as ZerospinApisUrlService,
  type ZerospinApisUrl,
} from '@zerospin/core/services/ZerospinApisUrl';
import type {
  ISystemEnvironmentId,
  ISystemId,
} from '@zerospin/core/system/types';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { newWebSocketRpcSession } from 'capnweb';
import { Effect, Redacted, type Schema } from 'effect';

export const fetchFrontend = Effect.fn('fetchFrontend')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  frontend: FRONTEND;
  generateSignature: () => Effect.Effect<
    Schema.Schema.Type<FRONTEND['signature']>,
    IAnyError,
    Async
  >;
}): Effect.fn.Return<
  {
    identity: {
      actor: IActor;
      accountId: IActor['accountId'];
      accountName: FRONTEND['accountName'];
      actorId: IActorId;
      actorName: FRONTEND['actorName'];
      deployId: string;
      frontendName: FRONTEND['frontendName'];
      frontendVersion: FRONTEND['version'];
      generationId: string;
      systemEnvironmentId: ISystemEnvironmentId;
      systemId: ISystemId;
      systemVersion: string;
      systemWorkerName: string;
    };
    frontendSpec: IFrontendControllerSpec;
    frontendApi: ReturnType<
      ReturnType<typeof newWebSocketRpcSession<ZerospinApis>>['getFrontendApi']
    >;
    releaseFrontendApi(): void;
  },
  IAnyError,
  Async | PublishableKey | ZerospinApisUrl | TelemetryCollector
> {
  const publishableKey = yield* PublishableKeyService;
  const signature = yield* props.generateSignature();
  const apiUrl = yield* ZerospinApisUrlService;

  const apis = yield* Effect.try({
    try: () => {
      const webSocketUrl = new URL(apiUrl);
      if (webSocketUrl.protocol === 'http:') {
        webSocketUrl.protocol = 'ws:';
      } else if (webSocketUrl.protocol === 'https:') {
        webSocketUrl.protocol = 'wss:';
      } else if (
        webSocketUrl.protocol !== 'ws:' &&
        webSocketUrl.protocol !== 'wss:'
      ) {
        throw new Error(
          'Account frontend RPC requires an HTTP(S) or WebSocket API URL',
        );
      }
      return newWebSocketRpcSession<ZerospinApis>(webSocketUrl.toString());
    },
    catch: ZerospinError.catch({
      code: 'async-failed',
      message: 'Failed to construct account frontend RPC WebSocket',
    }),
  });

  const frontendApi = apis.getFrontendApi({
    publishableKey: Redacted.value(publishableKey),
    accountName: props.frontend.accountName,
    actorName: props.frontend.actorName,
    frontendName: props.frontend.frontendName,
    signature,
  });

  // Admission transfers this session to the caller only after both identity
  // and compiled-target checks succeed. Every failure before that point owns
  // and closes the transport here.
  const admission = yield* Effect.gen(function* () {
    const client = makeTraceableApiTarget(frontendApi);
    const actorIdentity = yield* client
      .fetchActor()
      .pipe(
        Effect.mapError(error =>
          error instanceof Error
            ? ZerospinError.catch({ code: 'async-failed' })(error)
            : new ZerospinError(error),
        ),
      );
    const frontendSpec = yield* client
      .makeFrontendSpec()
      .pipe(
        Effect.mapError(error =>
          error instanceof Error
            ? ZerospinError.catch({ code: 'async-failed' })(error)
            : new ZerospinError(error),
        ),
      );

    if (
      frontendSpec.accountName !== props.frontend.accountName ||
      frontendSpec.actorName !== props.frontend.actorName ||
      frontendSpec.frontendName !== props.frontend.frontendName ||
      frontendSpec.version !== props.frontend.version
    ) {
      return yield* new ZerospinError({
        code: 'frontend-admission-target-mismatch',
        message:
          'Authenticated account frontend admission does not match the compiled controller',
        extra: {
          expectedAccountName: props.frontend.accountName,
          accountName: frontendSpec.accountName,
          expectedActorName: props.frontend.actorName,
          actorName: frontendSpec.actorName,
          expectedFrontendName: props.frontend.frontendName,
          frontendName: frontendSpec.frontendName,
          expectedFrontendVersion: props.frontend.version,
          frontendVersion: frontendSpec.version,
        },
      });
    }

    return {
      identity: {
        actor: actorIdentity.actor,
        accountId: actorIdentity.actor.accountId,
        accountName: props.frontend.accountName,
        actorId: actorIdentity.actor.actorId,
        actorName: props.frontend.actorName,
        deployId: actorIdentity.deployId,
        frontendName: props.frontend.frontendName,
        frontendVersion: props.frontend.version,
        generationId: actorIdentity.generationId,
        systemEnvironmentId: actorIdentity.systemEnvironmentId,
        systemId: actorIdentity.systemId,
        systemVersion: actorIdentity.systemVersion,
        systemWorkerName: actorIdentity.systemWorkerName,
      },
      frontendSpec,
      frontendApi,
    };
  }).pipe(
    Effect.onError(() =>
      Effect.sync(() => {
        try {
          frontendApi[Symbol.dispose]();
        } finally {
          apis[Symbol.dispose]();
        }
      }),
    ),
  );

  let isReleased = false;
  return {
    ...admission,
    releaseFrontendApi() {
      if (isReleased) {
        return;
      }
      isReleased = true;
      try {
        frontendApi[Symbol.dispose]();
      } finally {
        apis[Symbol.dispose]();
      }
    },
  };
}, annotateFunctionSpan);
