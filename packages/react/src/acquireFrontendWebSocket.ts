import type { Async } from '@zerospin/core/async/Async';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { IAccountId, IActorId } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { applyFrontendBlock } from '@zerospin/core/session/applyFrontendBlock';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { ISession } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import type { IAnyError } from '@zerospin/error';
import { annotateFunctionSpan } from '@zerospin/logger';
import { Effect, Exit, Redacted, Runtime, Schema, Scope } from 'effect';

export const acquireFrontendWebSocket = Effect.fn('acquireFrontendWebSocket')(
  function* <FRONTEND extends IFrontendController>(props: {
    session: ISession<FRONTEND>;
    accountId: IAccountId;
    actorId: IActorId;
    generationId: string;
    generateSignature: ISignatureFactory;
  }): Effect.fn.Return<
    Effect.Effect<void>,
    IAnyError,
    Async | CuidFactory | PublishableKey | ZerospinApisUrl
  > {
    const { session, accountId, actorId, generationId, generateSignature } =
      props;

    if (
      typeof window === 'undefined' ||
      typeof window.WebSocket !== 'function'
    ) {
      return Effect.void;
    }

    const apiUrl = yield* ZerospinApisUrl;
    const publishableKey = yield* PublishableKey;
    const signature = yield* generateSignature();
    const sessionState = session.store.getState();
    if (!sessionState.isInitialized) {
      return Effect.void;
    }
    const frontendBlockRepoName = `${coreAbbreviations.frontendBlockRepo}_${generationId}/${accountId}/${sessionState.accountName}/${session.frontend.actorName}/${actorId}/${session.frontend.frontendName}`;
    const frontendWebSocketUrl = new URL(apiUrl);
    if (frontendWebSocketUrl.protocol === 'https:') {
      frontendWebSocketUrl.protocol = 'wss:';
    } else if (frontendWebSocketUrl.protocol === 'http:') {
      frontendWebSocketUrl.protocol = 'ws:';
    }
    frontendWebSocketUrl.pathname = `/ws-subscriber/${encodeURIComponent(
      frontendBlockRepoName,
    )}`;
    frontendWebSocketUrl.search = '';
    frontendWebSocketUrl.searchParams.set(
      'publishableKey',
      Redacted.value(publishableKey),
    );
    frontendWebSocketUrl.searchParams.set(
      'accountName',
      session.frontend.accountName,
    );
    frontendWebSocketUrl.searchParams.set(
      'actorName',
      session.frontend.actorName,
    );
    frontendWebSocketUrl.searchParams.set(
      'frontendName',
      session.frontend.frontendName,
    );
    frontendWebSocketUrl.searchParams.set(
      'signature',
      JSON.stringify(signature),
    );

    const runtime = yield* Effect.runtime<
      Async | CuidFactory | PublishableKey | ZerospinApisUrl
    >();

    const frontendWebSocketScope = yield* Scope.make();
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const frontendWebSocket = new window.WebSocket(
          frontendWebSocketUrl.toString(),
        );
        frontendWebSocket.addEventListener('message', event => {
          Runtime.runSync(runtime)(
            Effect.gen(function* () {
              const message = yield* Schema.decodeUnknown(
                Schema.parseJson(
                  Schema.Struct({
                    type: Schema.Literal('frontendBlock'),
                    sync: FrontendBlockSchema,
                  }),
                ),
              )(String(event.data));
              const currentState = session.store.getState();
              if (!currentState.isInitialized) {
                return;
              }
              yield* Effect.annotateCurrentSpan(
                'frontendIndex',
                message.sync.frontendIndex,
              );
              if (
                currentState.frontendIndex !== null &&
                message.sync.frontendIndex <= currentState.frontendIndex
              ) {
                yield* Effect.annotateCurrentSpan('outcome', 'stale');
                return;
              }
              yield* applyFrontendBlock({
                db: currentState.db,
                frontend: session.frontend,
                models: currentState.models,
                frontendBlock: message.sync,
                lastRebasedPushedCursor: currentState.lastRebasedPushedCursor,
              });
              session.store.setState({
                frontendIndex: message.sync.frontendIndex,
                lastRebasedPushedCursor: message.sync.lastRebasedPushedCursor,
              });
              yield* Effect.annotateCurrentSpan('outcome', 'applied');
            }).pipe(
              Effect.withSpan('acquireFrontendWebSocket.frontendBlock', {
                root: true,
              }),
            ),
          );
        });
        return frontendWebSocket;
      }),
      frontendWebSocket =>
        Effect.sync(() => {
          frontendWebSocket.close();
        }),
    ).pipe(Scope.extend(frontendWebSocketScope));

    return Scope.close(frontendWebSocketScope, Exit.void);
  },
  annotateFunctionSpan,
);
