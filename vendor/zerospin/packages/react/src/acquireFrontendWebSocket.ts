import type { Async } from '@zerospin/core/async/Async';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { applyFrontendBlock } from '@zerospin/core/session/applyFrontendBlock';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { ISession } from '@zerospin/core/session/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { createFrontendWebSocketTicket } from '@zerospin/frontend/createFrontendWebSocketTicket';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Exit, Redacted, Runtime, Schema, Scope } from 'effect';

export const acquireFrontendWebSocket = Effect.fn('acquireFrontendWebSocket')(
  function* <FRONTEND extends IFrontendController>(props: {
    session: ISession<FRONTEND>;
  }): Effect.fn.Return<
    Effect.Effect<void>,
    IAnyError,
    Async | CuidFactory | PublishableKey | TelemetryCollector | ZerospinApisUrl
  > {
    const { session } = props;

    if (
      typeof window === 'undefined' ||
      typeof window.WebSocket !== 'function'
    ) {
      return Effect.void;
    }

    const apiUrl = yield* ZerospinApisUrl;
    const publishableKey = yield* PublishableKey;
    const sessionState = session.store.getState();
    if (!sessionState.isInitialized) {
      return Effect.void;
    }
    const ticket = yield* createFrontendWebSocketTicket({ session });
    const frontendWebSocketUrl = new URL(apiUrl);
    if (frontendWebSocketUrl.protocol === 'https:') {
      frontendWebSocketUrl.protocol = 'wss:';
    } else if (frontendWebSocketUrl.protocol === 'http:') {
      frontendWebSocketUrl.protocol = 'ws:';
    }
    frontendWebSocketUrl.pathname = '/ws-frontend-blocks';
    frontendWebSocketUrl.search = '';
    frontendWebSocketUrl.searchParams.set(
      'publishableKey',
      Redacted.value(publishableKey),
    );
    frontendWebSocketUrl.searchParams.set('ticket', ticket);

    const runtime = yield* Effect.runtime<
      Async | CuidFactory | PublishableKey | ZerospinApisUrl
    >();

    const frontendWebSocketScope = yield* Scope.make();
    yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const frontendWebSocket = yield* Effect.try({
          try: () => new window.WebSocket(frontendWebSocketUrl.toString()),
          catch: ZerospinError.catch({
            code: 'frontend-websocket-construction-failed',
            message: 'Failed to construct frontend WebSocket',
          }),
        });
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

        // Bootstrap is not complete until the network has accepted the upgrade.
        // A failed or closed pre-open socket rejects bootstrap; no reconnect is
        // attempted because the ticket has already been spent by the Worker.
        yield* Effect.async<void, IAnyError>(resume => {
          let settled = false;
          const onOpen = () => {
            if (settled) {
              return;
            }
            settled = true;
            frontendWebSocket.removeEventListener('open', onOpen);
            frontendWebSocket.removeEventListener('error', onError);
            frontendWebSocket.removeEventListener('close', onClose);
            resume(Effect.void);
          };
          const onError = () => {
            if (settled) {
              return;
            }
            settled = true;
            frontendWebSocket.removeEventListener('open', onOpen);
            frontendWebSocket.removeEventListener('error', onError);
            frontendWebSocket.removeEventListener('close', onClose);
            frontendWebSocket.close();
            resume(
              Effect.fail(
                new ZerospinError({
                  code: 'frontend-websocket-open-failed',
                  message: 'Frontend WebSocket failed before opening',
                }),
              ),
            );
          };
          const onClose = () => {
            if (settled) {
              return;
            }
            settled = true;
            frontendWebSocket.removeEventListener('open', onOpen);
            frontendWebSocket.removeEventListener('error', onError);
            frontendWebSocket.removeEventListener('close', onClose);
            resume(
              Effect.fail(
                new ZerospinError({
                  code: 'frontend-websocket-closed-before-open',
                  message: 'Frontend WebSocket closed before opening',
                }),
              ),
            );
          };
          frontendWebSocket.addEventListener('open', onOpen);
          frontendWebSocket.addEventListener('error', onError);
          frontendWebSocket.addEventListener('close', onClose);
          return Effect.sync(() => {
            if (!settled) {
              settled = true;
              frontendWebSocket.removeEventListener('open', onOpen);
              frontendWebSocket.removeEventListener('error', onError);
              frontendWebSocket.removeEventListener('close', onClose);
              frontendWebSocket.close();
            }
          });
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
