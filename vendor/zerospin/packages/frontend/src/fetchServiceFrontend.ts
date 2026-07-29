import type { Async } from '@zerospin/core/async/Async';
import type { IActorId } from '@zerospin/core/models/types';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import {
  PublishableKey as PublishableKeyService,
  type PublishableKey,
} from '@zerospin/core/services/PublishableKey';
import {
  ZerospinApisUrl as ZerospinApisUrlService,
  type ZerospinApisUrl,
} from '@zerospin/core/services/ZerospinApisUrl';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IServiceFrontendAdmission } from '@zerospin/dispatch-worker/ServiceFrontendApi';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { newWebSocketRpcSession } from 'capnweb';
import { Effect, Redacted, type Schema } from 'effect';

export const fetchServiceFrontend = Effect.fn('fetchServiceFrontend')(
  function* <FRONTEND extends IServiceFrontendController>(props: {
    frontend: FRONTEND;
    generateSignature: () => Effect.Effect<
      Schema.Schema.Type<FRONTEND['signature']>,
      IAnyError,
      Async
    >;
  }): Effect.fn.Return<
    {
      identity: {
        actorId: IActorId;
        systemId: ISystemId;
        generationId: string;
        systemVersion: string;
        systemWorkerName: string;
        serviceName: FRONTEND['serviceName'];
        actorName: FRONTEND['actorName'];
        frontendName: FRONTEND['frontendName'];
        frontendVersion: FRONTEND['version'];
      };
      frontendSpec: IServiceFrontendAdmission['frontendSpec'];
      frontendApi: Awaited<
        ReturnType<
          ReturnType<
            typeof newWebSocketRpcSession<ZerospinApis>
          >['getServiceFrontendApi']
        >
      >['frontendApi'];
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
            'Service frontend RPC requires an HTTP(S) or WebSocket API URL',
          );
        }
        return newWebSocketRpcSession<ZerospinApis>(webSocketUrl.toString());
      },
      catch: ZerospinError.catch({
        code: 'service-frontend-admission-transport-failed',
        message: 'Failed to construct service frontend RPC WebSocket',
      }),
    });
    let serviceFrontendApi:
      | Awaited<
          ReturnType<
            ReturnType<
              typeof newWebSocketRpcSession<ZerospinApis>
            >['getServiceFrontendApi']
          >
        >['frontendApi']
      | null = null;

    // The admission RPC returns a live target rooted in this transport. Keep
    // that transport open on success, but close it for every failed admission
    // before returning control to the caller.
    const admission = yield* Effect.gen(function* () {
      const admitted = yield* Effect.tryPromise({
        try: async () =>
          await apis.getServiceFrontendApi({
            publishableKey: Redacted.value(publishableKey),
            serviceName: props.frontend.serviceName,
            actorName: props.frontend.actorName,
            frontendName: props.frontend.frontendName,
            signature,
          }),
        catch: ZerospinError.catch({
          code: 'service-frontend-admission-transport-failed',
          message: 'Failed to request service frontend admission',
        }),
      });
      serviceFrontendApi = admitted.frontendApi;

      if (admitted._tag === 'Failure') {
        return yield* new ZerospinError(admitted.failure);
      }

      if (
        admitted.identity.serviceName !== props.frontend.serviceName ||
        admitted.identity.actorName !== props.frontend.actorName ||
        admitted.identity.frontendName !== props.frontend.frontendName ||
        admitted.identity.frontendVersion !== props.frontend.version
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-admission-target-mismatch',
          message:
            'Authenticated service frontend admission does not match the compiled controller',
          extra: {
            expectedServiceName: props.frontend.serviceName,
            serviceName: admitted.identity.serviceName,
            expectedActorName: props.frontend.actorName,
            actorName: admitted.identity.actorName,
            expectedFrontendName: props.frontend.frontendName,
            frontendName: admitted.identity.frontendName,
            expectedFrontendVersion: props.frontend.version,
            frontendVersion: admitted.identity.frontendVersion,
          },
        });
      }

      return {
        identity: {
          ...admitted.identity,
          serviceName: props.frontend.serviceName,
          actorName: props.frontend.actorName,
          frontendName: props.frontend.frontendName,
          frontendVersion: props.frontend.version,
        },
        frontendSpec: admitted.frontendSpec,
        frontendApi: serviceFrontendApi,
      };
    }).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          try {
            if (serviceFrontendApi !== null) {
              serviceFrontendApi[Symbol.dispose]();
            }
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
          if (serviceFrontendApi !== null) {
            serviceFrontendApi[Symbol.dispose]();
          }
        } finally {
          apis[Symbol.dispose]();
        }
      },
    };
  },
  annotateFunctionSpan,
);
