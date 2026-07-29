import type { Async } from '@zerospin/core/async/Async';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import {
  FrontendLineageBlockSchema,
  FrontendLineageTransitionRequiredSchema,
} from '@zerospin/core/session/FrontendBlockSchema';
import type {
  IFrontendGenerationBoundaryBlock,
  IFrontendLineageBlock,
  IFrontendSyncState,
} from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { createFrontendWebSocketTicket } from '@zerospin/frontend/createFrontendWebSocketTicket';
import { fetchFrontendState } from '@zerospin/frontend/fetchFrontendState';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Redacted, Runtime, Schema } from 'effect';

const FrontendSocketMessageSchema = Schema.parseJson(
  Schema.Union(
    Schema.Struct({
      type: Schema.Literal('frontendBlock'),
      sync: FrontendLineageBlockSchema,
    }),
    Schema.Struct({
      type: Schema.Literal('replay-complete'),
      generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
      frontendIndex: Schema.Number,
    }),
    Schema.Struct({
      type: Schema.Literal('state-required'),
      systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
      generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
      accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
      accountName: Schema.String,
      actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
      actorName: Schema.String,
      frontendName: Schema.String,
      frontendVersion: Schema.String,
      frontendIndex: Schema.Number,
    }),
    Schema.extend(
      FrontendLineageTransitionRequiredSchema,
      Schema.Struct({
        type: Schema.Literal('lineage-transition-required'),
      }),
    ),
  ),
);

/*
 * Direct mode owns one Provider socket. Each attempt mints a new one-use
 * ticket, sends the current lineage watermark in-band, waits for replay to
 * finish, and repairs through the already-bound FrontendApi before reconnect.
 */
export const acquireFrontendWebSocket = Effect.fn('acquireFrontendWebSocket')(
  function* <FRONTEND extends IFrontendController>(props: {
    frontend: FRONTEND;
    frontendApi: Parameters<typeof fetchFrontendState>[0]['frontendApi'];
    releaseFrontendApi(): void;
    identity: Readonly<{
      accountId: IFrontendSyncState['accountId'];
      accountName: string;
      actorId: IFrontendSyncState['actorId'];
      actorName: string;
      systemId: IFrontendSyncState['systemId'];
      generationId: string;
      systemVersion: string;
      systemWorkerName: string;
      frontendName: string;
      frontendVersion: string;
    }>;
    getFrontendIndex(): number;
    replaceFrontendState(
      frontendState: IFrontendSyncState,
    ): Effect.Effect<void, IAnyError>;
    handleFrontendLineageBlock(
      frontendLineageBlock: IFrontendLineageBlock,
    ): Effect.Effect<void, IAnyError>;
    regainFrontendApi(): Effect.Effect<
      Readonly<{
        frontendApi: Parameters<typeof fetchFrontendState>[0]['frontendApi'];
        releaseFrontendApi(): void;
        identity: Readonly<{
          accountId: IFrontendSyncState['accountId'];
          accountName: string;
          actorId: IFrontendSyncState['actorId'];
          actorName: string;
          systemId: IFrontendSyncState['systemId'];
          generationId: string;
          systemVersion: string;
          systemWorkerName: string;
          frontendName: string;
          frontendVersion: string;
        }>;
      }> | null,
      IAnyError,
      Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
    >;
    transitionToTarget(
      target: Readonly<{
        systemId: IFrontendSyncState['systemId'];
        generationId: string;
        accountId: IFrontendSyncState['accountId'];
        accountName: string;
        actorId: IFrontendSyncState['actorId'];
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      }>,
    ): Effect.Effect<
      Readonly<{
        frontendApi: Parameters<typeof fetchFrontendState>[0]['frontendApi'];
        releaseFrontendApi(): void;
        identity: Readonly<{
          accountId: IFrontendSyncState['accountId'];
          accountName: string;
          actorId: IFrontendSyncState['actorId'];
          actorName: string;
          systemId: IFrontendSyncState['systemId'];
          generationId: string;
          systemVersion: string;
          systemWorkerName: string;
          frontendName: string;
          frontendVersion: string;
        }>;
      }> | null,
      IAnyError,
      Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
    >;
    handleAuthorityFailure(error: IAnyError): Effect.Effect<void>;
    setStatus(
      status:
        | 'connecting'
        | 'replaying'
        | 'online'
        | 'repairing'
        | 'update-required'
        | 'failed',
    ): void;
  }): Effect.fn.Return<
    Effect.Effect<void>,
    IAnyError,
    Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
  > {
    if (
      typeof window === 'undefined' ||
      typeof window.WebSocket !== 'function'
    ) {
      props.releaseFrontendApi();
      return yield* new ZerospinError({
        code: 'frontend-websocket-unavailable',
        message:
          'Direct account frontend mode requires browser WebSocket support',
      });
    }

    const apiUrl = yield* ZerospinApisUrl;
    const publishableKey = yield* PublishableKey;
    const runtime = yield* Effect.runtime<
      Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
    >();

    return yield* Effect.async<Effect.Effect<void>, IAnyError>(resume => {
      let isReleased = false;
      let isInitialReady = false;
      let isTransitionRequired = false;
      let isFrontendVersionUpdateRequired = false;
      let authoritativeFrontendVersion: string | null = null;
      let reconnectAttempt = 0;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let socket: WebSocket | null = null;
      let messageTail = Promise.resolve();
      let connectTail = Promise.resolve();
      let releasePromise: Promise<void> | null = null;
      let isCurrentFrontendApiReleased = false;
      let currentFrontendApi = props.frontendApi;
      let releaseCurrentFrontendApi = props.releaseFrontendApi;
      let currentIdentity = props.identity;
      let appliedTransitionBoundary: IFrontendGenerationBoundaryBlock | null =
        null;
      let pendingTransition: Schema.Schema.Type<
        typeof FrontendLineageTransitionRequiredSchema
      > | null = null;

      const release = Effect.promise(async () => {
        if (releasePromise === null) {
          isReleased = true;
          if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (socket !== null) {
            socket.close();
            socket = null;
          }
          releasePromise = (async () => {
            await connectTail.catch(() => undefined);
            await messageTail.catch(() => undefined);
            if (!isCurrentFrontendApiReleased) {
              isCurrentFrontendApiReleased = true;
              releaseCurrentFrontendApi();
            }
          })();
        }
        await releasePromise;
      });

      const scheduleReconnect = () => {
        if (isReleased || isTransitionRequired || reconnectTimer !== null) {
          return;
        }
        const delay = Math.min(30_000, 250 * 2 ** reconnectAttempt);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectTail = connectTail
            .then(() => connect())
            .catch(() => undefined);
        }, delay);
      };

      const connect = async () => {
        if (isReleased || isTransitionRequired) {
          return;
        }
        props.setStatus(
          isFrontendVersionUpdateRequired ? 'update-required' : 'connecting',
        );
        try {
          if (pendingTransition !== null) {
            props.setStatus('repairing');
            const transitioned = await Runtime.runPromise(runtime)(
              props.transitionToTarget({
                systemId: pendingTransition.systemId,
                generationId: pendingTransition.generationId,
                accountId: pendingTransition.accountId,
                accountName: pendingTransition.accountName,
                actorId: pendingTransition.actorId,
                actorName: pendingTransition.actorName,
                frontendName: pendingTransition.frontendName,
                frontendVersion: pendingTransition.frontendVersion,
              }),
            );
            if (isReleased) {
              transitioned?.releaseFrontendApi();
              return;
            }
            if (transitioned === null) {
              isTransitionRequired = true;
              props.setStatus('update-required');
              if (!isInitialReady) {
                isInitialReady = true;
                resume(Effect.succeed(release));
              }
              return;
            }
            if (
              transitioned.identity.systemId !== pendingTransition.systemId ||
              transitioned.identity.generationId !==
                pendingTransition.generationId ||
              transitioned.identity.accountId !== pendingTransition.accountId ||
              transitioned.identity.accountName !==
                pendingTransition.accountName ||
              transitioned.identity.actorId !== pendingTransition.actorId ||
              transitioned.identity.actorName !== pendingTransition.actorName ||
              transitioned.identity.frontendName !==
                pendingTransition.frontendName ||
              transitioned.identity.frontendVersion !==
                pendingTransition.frontendVersion
            ) {
              transitioned.releaseFrontendApi();
              throw new ZerospinError({
                code: 'frontend-websocket-transition-result-mismatch',
                message:
                  'Reauthenticated account frontend does not match the pending transition target',
              });
            }
            const releaseSourceFrontendApi = releaseCurrentFrontendApi;
            currentFrontendApi = transitioned.frontendApi;
            releaseCurrentFrontendApi = transitioned.releaseFrontendApi;
            currentIdentity = transitioned.identity;
            pendingTransition = null;
            appliedTransitionBoundary = null;
            releaseSourceFrontendApi();
          }

          const ticketResult = await Runtime.runPromise(runtime)(
            createFrontendWebSocketTicket({
              frontendApi: currentFrontendApi,
            }).pipe(Effect.either),
          );
          if (ticketResult._tag === 'Left') {
            throw ticketResult.left;
          }
          const ticket = ticketResult.right;
          if (isReleased) {
            return;
          }
          if (
            ticket.systemId !== currentIdentity.systemId ||
            ticket.accountId !== currentIdentity.accountId ||
            ticket.accountName !== currentIdentity.accountName ||
            ticket.actorId !== currentIdentity.actorId ||
            ticket.actorName !== currentIdentity.actorName ||
            ticket.frontendName !== currentIdentity.frontendName
          ) {
            throw new ZerospinError({
              code: 'frontend-websocket-ticket-target-mismatch',
              message:
                'Fresh account frontend WebSocket ticket targets another actor or frontend',
            });
          }
          if (
            ticket.generationId === currentIdentity.generationId &&
            ticket.frontendVersion !== currentIdentity.frontendVersion
          ) {
            isFrontendVersionUpdateRequired = true;
            authoritativeFrontendVersion = ticket.frontendVersion;
            props.setStatus('update-required');
          }
          const webSocketUrl = new URL(apiUrl);
          webSocketUrl.protocol =
            webSocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          webSocketUrl.pathname = '/ws-frontend-blocks';
          webSocketUrl.search = '';
          webSocketUrl.searchParams.set(
            'publishableKey',
            Redacted.value(publishableKey),
          );
          webSocketUrl.searchParams.set('ticket', ticket.ticket);

          const nextSocket = new window.WebSocket(webSocketUrl.toString());
          socket = nextSocket;
          nextSocket.addEventListener('open', () => {
            if (isReleased || nextSocket !== socket) {
              nextSocket.close();
              return;
            }
            props.setStatus(
              isFrontendVersionUpdateRequired ? 'update-required' : 'replaying',
            );
            nextSocket.send(
              JSON.stringify({
                replicaGenerationId: currentIdentity.generationId,
                frontendIndex: props.getFrontendIndex(),
              }),
            );
          });
          nextSocket.addEventListener('message', event => {
            if (isReleased || nextSocket !== socket) {
              return;
            }
            messageTail = messageTail
              .then(async () => {
                if (isReleased || nextSocket !== socket) {
                  return;
                }
                const message = await Runtime.runPromise(runtime)(
                  Schema.decodeUnknown(FrontendSocketMessageSchema)(
                    String(event.data),
                    { onExcessProperty: 'error' },
                  ).pipe(
                    Effect.mapError(
                      ZerospinError.catch({
                        code: 'frontend-websocket-message-invalid',
                        message:
                          'Failed to decode account frontend WebSocket message',
                      }),
                    ),
                  ),
                );
                if (message.type === 'replay-complete') {
                  if (
                    message.generationId !== currentIdentity.generationId ||
                    message.frontendIndex !== props.getFrontendIndex()
                  ) {
                    throw new ZerospinError({
                      code: 'frontend-websocket-replay-watermark-mismatch',
                      message:
                        'Account frontend replay completed at an unexpected target watermark',
                    });
                  }
                  reconnectAttempt = 0;
                  props.setStatus(
                    isFrontendVersionUpdateRequired
                      ? 'update-required'
                      : 'online',
                  );
                  if (!isInitialReady) {
                    isInitialReady = true;
                    resume(Effect.succeed(release));
                  }
                  return;
                }
                if (message.type === 'state-required') {
                  if (
                    message.systemId !== currentIdentity.systemId ||
                    message.generationId !== currentIdentity.generationId ||
                    message.accountId !== currentIdentity.accountId ||
                    message.accountName !== currentIdentity.accountName ||
                    message.actorId !== currentIdentity.actorId ||
                    message.actorName !== currentIdentity.actorName ||
                    message.frontendName !== currentIdentity.frontendName ||
                    (message.frontendVersion !==
                      currentIdentity.frontendVersion &&
                      message.frontendVersion !== authoritativeFrontendVersion)
                  ) {
                    throw new ZerospinError({
                      code: 'frontend-websocket-state-required-target-mismatch',
                      message:
                        'Account frontend state-required control targets another session',
                    });
                  }
                  if (isFrontendVersionUpdateRequired) {
                    props.setStatus('update-required');
                    nextSocket.close();
                    return;
                  }
                  props.setStatus('repairing');
                  const frontendState = await Runtime.runPromise(runtime)(
                    fetchFrontendState({ frontendApi: currentFrontendApi }),
                  );
                  if (isReleased || nextSocket !== socket) {
                    return;
                  }
                  await Runtime.runPromise(runtime)(
                    props.replaceFrontendState(frontendState),
                  );
                  if (isReleased || nextSocket !== socket) {
                    return;
                  }
                  nextSocket.close();
                  return;
                }
                if (message.type === 'lineage-transition-required') {
                  if (
                    message.systemId !== currentIdentity.systemId ||
                    message.accountId !== currentIdentity.accountId ||
                    message.accountName !== currentIdentity.accountName ||
                    message.actorId !== currentIdentity.actorId ||
                    message.actorName !== currentIdentity.actorName ||
                    message.frontendName !== currentIdentity.frontendName ||
                    message.appliedBoundaryIndex !== props.getFrontendIndex() ||
                    appliedTransitionBoundary === null ||
                    appliedTransitionBoundary.frontendIndex !==
                      message.appliedBoundaryIndex
                  ) {
                    throw new ZerospinError({
                      code: 'frontend-websocket-transition-target-mismatch',
                      message:
                        'Account frontend transition control targets another session',
                    });
                  }
                  let previousBoundaryGenerationId =
                    appliedTransitionBoundary.generationId;
                  let previousBoundaryIndex =
                    appliedTransitionBoundary.frontendIndex;
                  for (const remainingBoundary of message.remainingBoundaries) {
                    if (
                      remainingBoundary.systemId !== currentIdentity.systemId ||
                      remainingBoundary.prevGenerationId !==
                        previousBoundaryGenerationId ||
                      remainingBoundary.accountId !==
                        currentIdentity.accountId ||
                      remainingBoundary.accountName !==
                        currentIdentity.accountName ||
                      remainingBoundary.actorId !== currentIdentity.actorId ||
                      remainingBoundary.actorName !==
                        currentIdentity.actorName ||
                      remainingBoundary.frontendName !==
                        currentIdentity.frontendName ||
                      remainingBoundary.frontendIndex <= previousBoundaryIndex
                    ) {
                      throw new ZerospinError({
                        code: 'frontend-websocket-transition-boundary-chain-invalid',
                        message:
                          'Account frontend transition descriptors do not form one ordered lineage',
                      });
                    }
                    previousBoundaryGenerationId =
                      remainingBoundary.generationId;
                    previousBoundaryIndex = remainingBoundary.frontendIndex;
                  }
                  if (previousBoundaryGenerationId !== message.generationId) {
                    throw new ZerospinError({
                      code: 'frontend-websocket-transition-boundary-target-mismatch',
                      message:
                        'Account frontend transition descriptors do not reach the requested target generation',
                    });
                  }
                  pendingTransition = message;
                  props.setStatus('repairing');
                  const transitioned = await Runtime.runPromise(runtime)(
                    props.transitionToTarget({
                      systemId: message.systemId,
                      generationId: message.generationId,
                      accountId: message.accountId,
                      accountName: message.accountName,
                      actorId: message.actorId,
                      actorName: message.actorName,
                      frontendName: message.frontendName,
                      frontendVersion: message.frontendVersion,
                    }),
                  );
                  if (isReleased || nextSocket !== socket) {
                    transitioned?.releaseFrontendApi();
                    return;
                  }
                  if (transitioned === null) {
                    isTransitionRequired = true;
                    props.setStatus('update-required');
                    nextSocket.close();
                    if (!isInitialReady) {
                      isInitialReady = true;
                      resume(Effect.succeed(release));
                    }
                    return;
                  }
                  if (
                    transitioned.identity.systemId !== message.systemId ||
                    transitioned.identity.generationId !==
                      message.generationId ||
                    transitioned.identity.accountId !== message.accountId ||
                    transitioned.identity.accountName !== message.accountName ||
                    transitioned.identity.actorId !== message.actorId ||
                    transitioned.identity.actorName !== message.actorName ||
                    transitioned.identity.frontendName !==
                      message.frontendName ||
                    transitioned.identity.frontendVersion !==
                      message.frontendVersion
                  ) {
                    transitioned.releaseFrontendApi();
                    throw new ZerospinError({
                      code: 'frontend-websocket-transition-result-mismatch',
                      message:
                        'Reauthenticated account frontend does not match the transition target',
                    });
                  }
                  const releaseSourceFrontendApi = releaseCurrentFrontendApi;
                  currentFrontendApi = transitioned.frontendApi;
                  releaseCurrentFrontendApi = transitioned.releaseFrontendApi;
                  currentIdentity = transitioned.identity;
                  pendingTransition = null;
                  appliedTransitionBoundary = null;
                  releaseSourceFrontendApi();
                  nextSocket.close();
                  return;
                }

                const lineageBlock = message.sync;
                if (
                  lineageBlock.systemId !== currentIdentity.systemId ||
                  lineageBlock.accountId !== currentIdentity.accountId ||
                  lineageBlock.accountName !== currentIdentity.accountName ||
                  lineageBlock.actorId !== currentIdentity.actorId ||
                  lineageBlock.actorName !== currentIdentity.actorName ||
                  lineageBlock.frontendName !== currentIdentity.frontendName
                ) {
                  throw new ZerospinError({
                    code: 'frontend-websocket-block-target-mismatch',
                    message: 'Account frontend block targets another session',
                  });
                }
                await Runtime.runPromise(runtime)(
                  props.handleFrontendLineageBlock(lineageBlock),
                );
                if (isReleased || nextSocket !== socket) {
                  return;
                }
                if (lineageBlock.kind === 'generation-boundary') {
                  appliedTransitionBoundary = lineageBlock;
                }
              })
              .catch(async error => {
                if (isReleased) {
                  return;
                }
                const failure = ZerospinError.isZerospinError(error)
                  ? error
                  : ZerospinError.catch({
                      code: 'frontend-websocket-message-failed',
                      message:
                        'Failed to apply an account frontend WebSocket message',
                    })(error);
                const isAuthorityFailure =
                  String(failure.code).includes('signature-invalid') ||
                  String(failure.code).includes('authentication') ||
                  String(failure.code).includes('authorization') ||
                  String(failure.code).includes('authenticate') ||
                  String(failure.code).includes('authorize') ||
                  String(failure.code).includes('authenticator') ||
                  String(failure.code).includes('authority') ||
                  String(failure.code).includes('identity') ||
                  String(failure.code) ===
                    'frontend-admission-target-mismatch' ||
                  String(failure.code) ===
                    'frontend-transport-regain-compiled-spec-mismatch' ||
                  String(failure.code).startsWith('frontend-transition-') ||
                  String(failure.code) ===
                    'frontend-websocket-regained-target-mismatch' ||
                  String(failure.code) ===
                    'frontend-websocket-transition-result-mismatch';
                if (isAuthorityFailure) {
                  isReleased = true;
                  props.setStatus('failed');
                  if (reconnectTimer !== null) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                  }
                  nextSocket.close();
                  await Runtime.runPromise(runtime)(
                    props.handleAuthorityFailure(failure),
                  ).catch(() => undefined);
                  if (!isCurrentFrontendApiReleased) {
                    isCurrentFrontendApiReleased = true;
                    releaseCurrentFrontendApi();
                  }
                  if (!isInitialReady) {
                    isInitialReady = true;
                    resume(Effect.fail(failure));
                  }
                  return;
                }
                if (isFrontendVersionUpdateRequired) {
                  props.setStatus('update-required');
                } else {
                  props.setStatus('repairing');
                  try {
                    const frontendState = await Runtime.runPromise(runtime)(
                      fetchFrontendState({ frontendApi: currentFrontendApi }),
                    );
                    if (isReleased || nextSocket !== socket) {
                      return;
                    }
                    await Runtime.runPromise(runtime)(
                      props.replaceFrontendState(frontendState),
                    );
                  } catch {
                    // Keep the current readable state and retry repair through a
                    // fresh admission/ticket attempt after this socket closes.
                  }
                }
                if (isReleased || nextSocket !== socket) {
                  return;
                }
                nextSocket.close();
              });
          });
          nextSocket.addEventListener('error', () => {
            nextSocket.close();
          });
          nextSocket.addEventListener('close', () => {
            if (socket === nextSocket) {
              socket = null;
            }
            scheduleReconnect();
          });
        } catch (error) {
          if (isReleased) {
            return;
          }
          const isTransportFailure =
            ZerospinError.isZerospinError(error) &&
            (error.code === 'frontend-admission-transport-failed' ||
              error.code === 'async-failed' ||
              error.cause?.includes('fetch failed') === true ||
              error.cause?.includes('ECONNREFUSED') === true ||
              error.cause?.includes('NetworkError') === true);
          const failure = ZerospinError.isZerospinError(error)
            ? error
            : ZerospinError.catch({
                code: 'frontend-websocket-connect-failed',
                message:
                  'Failed to establish direct account frontend WebSocket',
              })(error);
          const isAuthorityFailure =
            String(failure.code).includes('signature-invalid') ||
            String(failure.code).includes('authentication') ||
            String(failure.code).includes('authorization') ||
            String(failure.code).includes('authenticate') ||
            String(failure.code).includes('authorize') ||
            String(failure.code).includes('authenticator') ||
            String(failure.code).includes('authority') ||
            String(failure.code).includes('identity') ||
            String(failure.code) === 'frontend-admission-target-mismatch' ||
            String(failure.code) ===
              'frontend-transport-regain-compiled-spec-mismatch' ||
            String(failure.code).startsWith('frontend-transition-') ||
            String(failure.code) ===
              'frontend-websocket-regained-target-mismatch' ||
            String(failure.code) ===
              'frontend-websocket-transition-result-mismatch';
          if (isAuthorityFailure) {
            isReleased = true;
            props.setStatus('failed');
            if (reconnectTimer !== null) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            if (socket !== null) {
              socket.close();
              socket = null;
            }
            await Runtime.runPromise(runtime)(
              props.handleAuthorityFailure(failure),
            ).catch(() => undefined);
            if (!isCurrentFrontendApiReleased) {
              isCurrentFrontendApiReleased = true;
              releaseCurrentFrontendApi();
            }
            if (!isInitialReady) {
              isInitialReady = true;
              resume(Effect.fail(failure));
            }
            return;
          }
          if (isTransportFailure) {
            try {
              const regainedResult = await Runtime.runPromise(runtime)(
                props.regainFrontendApi().pipe(Effect.either),
              );
              if (regainedResult._tag === 'Left') {
                throw regainedResult.left;
              }
              const regained = regainedResult.right;
              if (isReleased) {
                regained?.releaseFrontendApi();
                return;
              }
              if (regained === null) {
                isFrontendVersionUpdateRequired = true;
                isTransitionRequired = true;
                props.setStatus('update-required');
                if (!isInitialReady) {
                  isInitialReady = true;
                  resume(Effect.succeed(release));
                }
                return;
              }
              if (
                regained.identity.systemId !== currentIdentity.systemId ||
                regained.identity.accountId !== currentIdentity.accountId ||
                regained.identity.accountName !== currentIdentity.accountName ||
                regained.identity.actorId !== currentIdentity.actorId ||
                regained.identity.actorName !== currentIdentity.actorName ||
                regained.identity.frontendName !==
                  currentIdentity.frontendName ||
                regained.identity.frontendVersion !==
                  currentIdentity.frontendVersion
              ) {
                regained.releaseFrontendApi();
                throw new ZerospinError({
                  code: 'frontend-websocket-regained-target-mismatch',
                  message:
                    'Reauthenticated account frontend transport does not match the readable replica target',
                });
              }
              const releasePreviousFrontendApi = releaseCurrentFrontendApi;
              currentFrontendApi = regained.frontendApi;
              releaseCurrentFrontendApi = regained.releaseFrontendApi;
              releasePreviousFrontendApi();
            } catch (regainError) {
              if (isReleased) {
                return;
              }
              const isRegainTransportFailure =
                ZerospinError.isZerospinError(regainError) &&
                (regainError.code === 'frontend-admission-transport-failed' ||
                  regainError.code === 'async-failed' ||
                  regainError.cause?.includes('fetch failed') === true ||
                  regainError.cause?.includes('ECONNREFUSED') === true ||
                  regainError.cause?.includes('NetworkError') === true);
              const isRegainAuthorityFailure =
                ZerospinError.isZerospinError(regainError) &&
                (String(regainError.code).includes('signature-invalid') ||
                  String(regainError.code).includes('authentication') ||
                  String(regainError.code).includes('authorization') ||
                  String(regainError.code).includes('authenticate') ||
                  String(regainError.code).includes('authorize') ||
                  String(regainError.code).includes('authenticator') ||
                  String(regainError.code).includes('authority') ||
                  String(regainError.code).includes('identity') ||
                  regainError.code === 'frontend-admission-target-mismatch' ||
                  regainError.code ===
                    'frontend-transport-regain-compiled-spec-mismatch' ||
                  String(regainError.code).startsWith(
                    'frontend-transition-',
                  ) ||
                  regainError.code ===
                    'frontend-websocket-regained-target-mismatch' ||
                  regainError.code ===
                    'frontend-websocket-transition-result-mismatch');
              if (isRegainTransportFailure) {
                if (!isInitialReady && reconnectAttempt >= 8) {
                  const regainFailure = ZerospinError.isZerospinError(
                    regainError,
                  )
                    ? regainError
                    : ZerospinError.catch({
                        code: 'frontend-websocket-transport-regain-failed',
                        message:
                          'Failed to regain direct account frontend transport',
                      })(regainError);
                  props.setStatus('failed');
                  if (!isCurrentFrontendApiReleased) {
                    isCurrentFrontendApiReleased = true;
                    releaseCurrentFrontendApi();
                  }
                  resume(Effect.fail(regainFailure));
                  return;
                }
                scheduleReconnect();
                return;
              }
              if (isRegainAuthorityFailure) {
                const regainFailure = regainError;
                isReleased = true;
                props.setStatus('failed');
                if (reconnectTimer !== null) {
                  clearTimeout(reconnectTimer);
                  reconnectTimer = null;
                }
                if (socket !== null) {
                  socket.close();
                  socket = null;
                }
                await Runtime.runPromise(runtime)(
                  props.handleAuthorityFailure(regainFailure),
                ).catch(() => undefined);
                if (!isCurrentFrontendApiReleased) {
                  isCurrentFrontendApiReleased = true;
                  releaseCurrentFrontendApi();
                }
                if (!isInitialReady) {
                  isInitialReady = true;
                  resume(Effect.fail(regainFailure));
                }
                return;
              }
              props.setStatus(
                isFrontendVersionUpdateRequired
                  ? 'update-required'
                  : 'repairing',
              );
              scheduleReconnect();
              return;
            }
            scheduleReconnect();
            return;
          }
          if (!isInitialReady && reconnectAttempt >= 8) {
            props.setStatus('failed');
            if (!isCurrentFrontendApiReleased) {
              isCurrentFrontendApiReleased = true;
              releaseCurrentFrontendApi();
            }
            resume(Effect.fail(failure));
            return;
          }
          scheduleReconnect();
        }
      };

      connectTail = connectTail.then(() => connect()).catch(() => undefined);

      return release;
    });
  },
  annotateFunctionSpan,
);
