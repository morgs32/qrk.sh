import type { Async } from '@zerospin/core/async/Async';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import {
  ServiceFrontendBlockSchema,
  ServiceFrontendLineageTransitionRequiredSchema,
} from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type {
  IServiceFrontendGenerationBoundaryBlock,
  IServiceFrontendLineageBlock,
  IServiceFrontendState,
} from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { createServiceFrontendWebSocketTicket } from '@zerospin/frontend/createServiceFrontendWebSocketTicket';
import { fetchServiceFrontendState } from '@zerospin/frontend/fetchServiceFrontendState';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Redacted, Runtime, Schema } from 'effect';

const ServiceFrontendLineageBlockSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal('generation-boundary'),
    systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
    prevGenerationId: Schema.String,
    generationId: Schema.String,
    serviceName: Schema.String,
    actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
    actorName: Schema.String,
    frontendName: Schema.String,
    frontendIndex: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal('service-frontend'),
    systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
    generationId: Schema.String,
    serviceName: Schema.String,
    actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
    actorName: Schema.String,
    frontendName: Schema.String,
    frontendBlock: ServiceFrontendBlockSchema,
  }),
);

const ServiceFrontendSocketMessageSchema = Schema.parseJson(
  Schema.Union(
    Schema.Struct({
      type: Schema.Literal('serviceFrontendBlock'),
      sync: ServiceFrontendLineageBlockSchema,
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
      serviceName: Schema.String,
      actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
      actorName: Schema.String,
      frontendName: Schema.String,
      frontendVersion: Schema.String,
      frontendIndex: Schema.Number,
    }),
    Schema.extend(
      ServiceFrontendLineageTransitionRequiredSchema,
      Schema.Struct({
        type: Schema.Literal('lineage-transition-required'),
      }),
    ),
  ),
);

/*
 * Direct mode owns one Provider socket. Every connection mints a fresh ticket,
 * sends its changing resume watermark in-band, waits for replay-complete, and
 * repairs from bound full state before reconnecting after state-required.
 */
export const acquireServiceFrontendWebSocket = Effect.fn(
  'acquireServiceFrontendWebSocket',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  frontend: FRONTEND;
  frontendApi: Parameters<typeof fetchServiceFrontendState>[0]['frontendApi'];
  releaseFrontendApi(): void;
  identity: Readonly<{
    actorId: IServiceFrontendState['actorId'];
    systemId: IServiceFrontendState['systemId'];
    generationId: string;
    systemVersion: string;
    systemWorkerName: string;
    serviceName: string;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
  }>;
  getFrontendIndex(): number;
  replaceFrontendState(
    frontendState: IServiceFrontendState,
  ): Effect.Effect<void, IAnyError>;
  handleServiceFrontendLineageBlock(
    serviceFrontendLineageBlock: IServiceFrontendLineageBlock,
  ): Effect.Effect<void, IAnyError>;
  regainFrontendApi(): Effect.Effect<
    Readonly<{
      frontendApi: Parameters<
        typeof fetchServiceFrontendState
      >[0]['frontendApi'];
      releaseFrontendApi(): void;
      identity: Readonly<{
        actorId: IServiceFrontendState['actorId'];
        systemId: IServiceFrontendState['systemId'];
        generationId: string;
        systemVersion: string;
        systemWorkerName: string;
        serviceName: string;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      }>;
    }> | null,
    IAnyError,
    Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
  >;
  transitionToTarget(
    target: Readonly<{
      systemId: IServiceFrontendState['systemId'];
      generationId: string;
      serviceName: string;
      actorId: IServiceFrontendState['actorId'];
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    }>,
  ): Effect.Effect<
    Readonly<{
      frontendApi: Parameters<
        typeof fetchServiceFrontendState
      >[0]['frontendApi'];
      releaseFrontendApi(): void;
      identity: Readonly<{
        actorId: IServiceFrontendState['actorId'];
        systemId: IServiceFrontendState['systemId'];
        generationId: string;
        systemVersion: string;
        systemWorkerName: string;
        serviceName: string;
        actorName: string;
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
  if (typeof window === 'undefined' || typeof window.WebSocket !== 'function') {
    props.releaseFrontendApi();
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-unavailable',
      message:
        'Direct service frontend mode requires browser WebSocket support',
    });
  }

  const apiUrl = yield* ZerospinApisUrl;
  const publishableKey = yield* PublishableKey;
  const runtime = yield* Effect.runtime<
    Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
  >();

  return yield* Effect.async<Effect.Effect<void>, IAnyError>(resume => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let isReleased = false;
    let isInitialReady = false;
    let isTransitionRequired = false;
    let isFrontendVersionUpdateRequired = false;
    let authoritativeFrontendVersion: string | null = null;
    let messageTail: Promise<void> = Promise.resolve();
    let connectTail = Promise.resolve();
    let releasePromise: Promise<void> | null = null;
    let isCurrentFrontendApiReleased = false;
    let currentFrontendApi = props.frontendApi;
    let releaseCurrentFrontendApi = props.releaseFrontendApi;
    let currentIdentity = props.identity;
    let appliedTransitionBoundary: IServiceFrontendGenerationBoundaryBlock | null =
      null;
    let pendingTransition: Schema.Schema.Type<
      typeof ServiceFrontendLineageTransitionRequiredSchema
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
        connectTail = connectTail.then(() => connect()).catch(() => undefined);
      }, delay);
    };

    const connect = async (): Promise<void> => {
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
              serviceName: pendingTransition.serviceName,
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
            transitioned.identity.serviceName !==
              pendingTransition.serviceName ||
            transitioned.identity.actorId !== pendingTransition.actorId ||
            transitioned.identity.actorName !== pendingTransition.actorName ||
            transitioned.identity.frontendName !==
              pendingTransition.frontendName ||
            transitioned.identity.frontendVersion !==
              pendingTransition.frontendVersion
          ) {
            transitioned.releaseFrontendApi();
            throw new ZerospinError({
              code: 'service-frontend-websocket-transition-result-mismatch',
              message:
                'Reauthenticated service frontend does not match the pending transition target',
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
          createServiceFrontendWebSocketTicket({
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
          ticket.serviceName !== currentIdentity.serviceName ||
          ticket.actorId !== currentIdentity.actorId ||
          ticket.actorName !== currentIdentity.actorName ||
          ticket.frontendName !== currentIdentity.frontendName
        ) {
          throw new ZerospinError({
            code: 'service-frontend-websocket-ticket-target-mismatch',
            message:
              'Fresh service frontend WebSocket ticket targets another actor or frontend',
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
        webSocketUrl.pathname = '/ws-service-frontend-blocks';
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
                Schema.decodeUnknown(ServiceFrontendSocketMessageSchema)(
                  String(event.data),
                  { onExcessProperty: 'error' },
                ).pipe(
                  Effect.mapError(
                    ZerospinError.catch({
                      code: 'service-frontend-websocket-message-invalid',
                      message:
                        'Failed to decode service frontend WebSocket message',
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
                    code: 'service-frontend-websocket-replay-watermark-mismatch',
                    message:
                      'Service frontend replay completed at an unexpected target watermark',
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
                  message.serviceName !== currentIdentity.serviceName ||
                  message.actorId !== currentIdentity.actorId ||
                  message.actorName !== currentIdentity.actorName ||
                  message.frontendName !== currentIdentity.frontendName ||
                  (message.frontendVersion !==
                    currentIdentity.frontendVersion &&
                    message.frontendVersion !== authoritativeFrontendVersion)
                ) {
                  throw new ZerospinError({
                    code: 'service-frontend-websocket-state-required-target-mismatch',
                    message:
                      'Service frontend state-required control targets another session',
                  });
                }
                if (isFrontendVersionUpdateRequired) {
                  props.setStatus('update-required');
                  nextSocket.close();
                  return;
                }
                props.setStatus('repairing');
                const frontendState = await Runtime.runPromise(runtime)(
                  fetchServiceFrontendState({
                    frontendApi: currentFrontendApi,
                  }),
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
                  message.serviceName !== currentIdentity.serviceName ||
                  message.actorId !== currentIdentity.actorId ||
                  message.actorName !== currentIdentity.actorName ||
                  message.frontendName !== currentIdentity.frontendName ||
                  message.appliedBoundaryIndex !== props.getFrontendIndex() ||
                  appliedTransitionBoundary === null ||
                  appliedTransitionBoundary.frontendIndex !==
                    message.appliedBoundaryIndex
                ) {
                  throw new ZerospinError({
                    code: 'service-frontend-websocket-transition-target-mismatch',
                    message:
                      'Service frontend transition control targets another session',
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
                    remainingBoundary.serviceName !==
                      currentIdentity.serviceName ||
                    remainingBoundary.actorId !== currentIdentity.actorId ||
                    remainingBoundary.actorName !== currentIdentity.actorName ||
                    remainingBoundary.frontendName !==
                      currentIdentity.frontendName ||
                    remainingBoundary.frontendIndex <= previousBoundaryIndex
                  ) {
                    throw new ZerospinError({
                      code: 'service-frontend-websocket-transition-boundary-chain-invalid',
                      message:
                        'Service frontend transition descriptors do not form one ordered lineage',
                    });
                  }
                  previousBoundaryGenerationId = remainingBoundary.generationId;
                  previousBoundaryIndex = remainingBoundary.frontendIndex;
                }
                if (previousBoundaryGenerationId !== message.generationId) {
                  throw new ZerospinError({
                    code: 'service-frontend-websocket-transition-boundary-target-mismatch',
                    message:
                      'Service frontend transition descriptors do not reach the requested target generation',
                  });
                }
                pendingTransition = message;
                props.setStatus('repairing');
                const transitioned = await Runtime.runPromise(runtime)(
                  props.transitionToTarget({
                    systemId: message.systemId,
                    generationId: message.generationId,
                    serviceName: message.serviceName,
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
                  transitioned.identity.generationId !== message.generationId ||
                  transitioned.identity.serviceName !== message.serviceName ||
                  transitioned.identity.actorId !== message.actorId ||
                  transitioned.identity.actorName !== message.actorName ||
                  transitioned.identity.frontendName !== message.frontendName ||
                  transitioned.identity.frontendVersion !==
                    message.frontendVersion
                ) {
                  transitioned.releaseFrontendApi();
                  throw new ZerospinError({
                    code: 'service-frontend-websocket-transition-result-mismatch',
                    message:
                      'Reauthenticated service frontend does not match the transition target',
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

              const lineageBlock: IServiceFrontendLineageBlock = message.sync;
              const hasInvalidGenerationLineage =
                lineageBlock.kind === 'generation-boundary'
                  ? lineageBlock.prevGenerationId !==
                      currentIdentity.generationId ||
                    lineageBlock.generationId === currentIdentity.generationId
                  : lineageBlock.generationId !== currentIdentity.generationId;
              const hasInvalidNestedServiceTarget =
                lineageBlock.kind === 'service-frontend' &&
                (lineageBlock.frontendBlock.serviceName !==
                  currentIdentity.serviceName ||
                  lineageBlock.frontendBlock.actorId !==
                    currentIdentity.actorId ||
                  lineageBlock.frontendBlock.actorName !==
                    currentIdentity.actorName ||
                  lineageBlock.frontendBlock.frontendName !==
                    currentIdentity.frontendName);
              if (
                lineageBlock.systemId !== currentIdentity.systemId ||
                lineageBlock.serviceName !== currentIdentity.serviceName ||
                lineageBlock.actorId !== currentIdentity.actorId ||
                lineageBlock.actorName !== currentIdentity.actorName ||
                lineageBlock.frontendName !== currentIdentity.frontendName ||
                hasInvalidGenerationLineage ||
                hasInvalidNestedServiceTarget
              ) {
                throw new ZerospinError({
                  code: 'service-frontend-websocket-block-target-mismatch',
                  message:
                    'Service frontend WebSocket block does not continue the bound session lineage',
                });
              }
              await Runtime.runPromise(runtime)(
                props.handleServiceFrontendLineageBlock(lineageBlock),
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
                    code: 'service-frontend-websocket-message-failed',
                    message:
                      'Failed to apply a service frontend WebSocket message',
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
                  'service-frontend-admission-target-mismatch' ||
                String(failure.code) ===
                  'service-frontend-transport-regain-compiled-spec-mismatch' ||
                String(failure.code).startsWith(
                  'service-frontend-transition-',
                ) ||
                String(failure.code) ===
                  'service-frontend-websocket-regained-target-mismatch' ||
                String(failure.code) ===
                  'service-frontend-websocket-transition-result-mismatch';
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
                    fetchServiceFrontendState({
                      frontendApi: currentFrontendApi,
                    }),
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
          (error.code === 'service-frontend-admission-transport-failed' ||
            error.code === 'async-failed' ||
            error.cause?.includes('fetch failed') === true ||
            error.cause?.includes('ECONNREFUSED') === true ||
            error.cause?.includes('NetworkError') === true);
        const failure = ZerospinError.isZerospinError(error)
          ? error
          : ZerospinError.catch({
              code: 'service-frontend-websocket-connect-failed',
              message: 'Failed to establish direct service frontend WebSocket',
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
            'service-frontend-admission-target-mismatch' ||
          String(failure.code) ===
            'service-frontend-transport-regain-compiled-spec-mismatch' ||
          String(failure.code).startsWith('service-frontend-transition-') ||
          String(failure.code) ===
            'service-frontend-websocket-regained-target-mismatch' ||
          String(failure.code) ===
            'service-frontend-websocket-transition-result-mismatch';
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
              regained.identity.serviceName !== currentIdentity.serviceName ||
              regained.identity.actorId !== currentIdentity.actorId ||
              regained.identity.actorName !== currentIdentity.actorName ||
              regained.identity.frontendName !== currentIdentity.frontendName ||
              regained.identity.frontendVersion !==
                currentIdentity.frontendVersion
            ) {
              regained.releaseFrontendApi();
              throw new ZerospinError({
                code: 'service-frontend-websocket-regained-target-mismatch',
                message:
                  'Reauthenticated service frontend transport does not match the readable replica target',
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
              (regainError.code ===
                'service-frontend-admission-transport-failed' ||
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
                regainError.code ===
                  'service-frontend-admission-target-mismatch' ||
                regainError.code ===
                  'service-frontend-transport-regain-compiled-spec-mismatch' ||
                String(regainError.code).startsWith(
                  'service-frontend-transition-',
                ) ||
                regainError.code ===
                  'service-frontend-websocket-regained-target-mismatch' ||
                regainError.code ===
                  'service-frontend-websocket-transition-result-mismatch');
            if (isRegainTransportFailure) {
              if (!isInitialReady && reconnectAttempt >= 8) {
                const regainFailure = ZerospinError.isZerospinError(regainError)
                  ? regainError
                  : ZerospinError.catch({
                      code: 'service-frontend-websocket-transport-regain-failed',
                      message:
                        'Failed to regain direct service frontend transport',
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
}, annotateFunctionSpan);
