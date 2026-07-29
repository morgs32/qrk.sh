import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Layer, Redacted, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireFrontendWebSocket } from './acquireFrontendWebSocket';

const createFrontendWebSocketTicketMock = vi.hoisted(() => vi.fn());
const fetchFrontendStateMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/frontend/createFrontendWebSocketTicket', () => ({
  createFrontendWebSocketTicket: createFrontendWebSocketTicketMock,
}));
vi.mock('@zerospin/frontend/fetchFrontendState', () => ({
  fetchFrontendState: fetchFrontendStateMock,
}));

const frontend = makeFrontendController({
  systemName: 'direct-transition-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const sourceIdentity = {
  systemId: 'sys_direct',
  generationId: 'gen_source',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker-source',
  accountId: 'acct_direct',
  accountName: frontend.accountName,
  actorId: 'actr_direct',
  actorName: frontend.actorName,
  frontendName: frontend.frontendName,
  frontendVersion: frontend.version,
};

const targetIdentity = {
  ...sourceIdentity,
  generationId: 'gen_target',
  systemVersion: '2.0.0',
  systemWorkerName: 'worker-target',
};

const telemetryCollector = makeTelemetryCollector();
const TestLayer = Layer.mergeAll(
  AsyncLive,
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(ZerospinApisUrl, 'https://api.example.test'),
  makeTelemetryLayer(telemetryCollector),
);

let sockets: Array<{
  sent: string[];
  close(): void;
  emit(type: string, event: Event): void;
}>;

beforeEach(() => {
  vi.useFakeTimers();
  createFrontendWebSocketTicketMock.mockReset();
  fetchFrontendStateMock.mockReset();
  sockets = [];
  vi.stubGlobal(
    'WebSocket',
    class {
      readonly sent: string[] = [];
      readonly listeners = new Map<string, Array<(event: Event) => void>>();
      isClosed = false;

      constructor(_url: string) {
        sockets.push(this);
      }

      addEventListener(type: string, listener: (event: Event) => void) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      send(value: string) {
        this.sent.push(value);
      }

      close() {
        if (this.isClosed) {
          return;
        }
        this.isClosed = true;
        this.emit('close', new Event('close'));
      }

      emit(type: string, event: Event) {
        const listeners = this.listeners.get(type) ?? [];
        for (const listener of listeners) {
          listener(event);
        }
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  telemetryCollector.flush();
});

describe('acquireFrontendWebSocket direct lineage transitions', () => {
  it('repairs from bound full state after a client-detected message failure before reconnecting', async () => {
    let frontendIndex = 4;
    const statuses: string[] = [];
    const releaseFrontendApi = vi.fn();
    const replaceFrontendState = vi.fn(() =>
      Effect.sync(() => {
        frontendIndex = 8;
      }),
    );
    createFrontendWebSocketTicketMock.mockReturnValue(
      Effect.succeed({
        ticket: 'repair-ticket',
        ...sourceIdentity,
      }),
    );
    fetchFrontendStateMock.mockReturnValue(
      Effect.succeed({
        ...sourceIdentity,
        frontendIndex: 8,
        resources: {},
        pendingPushedCommands: [],
        executedPushedCommands: [],
        failedPushedCommands: [],
        lastRebasedPushedCursor: null,
      }),
    );

    const releasePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => frontendIndex,
        replaceFrontendState,
        handleFrontendLineageBlock: () => Effect.void,
        regainFrontendApi: () => Effect.succeed(null),
        transitionToTarget: () => Effect.succeed(null),
        handleAuthorityFailure: () => Effect.void,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]?.emit('open', new Event('open'));
    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'not-a-valid-frontend-message' }),
      }),
    );

    await vi.waitFor(() => expect(replaceFrontendState).toHaveBeenCalledOnce());
    expect(fetchFrontendStateMock).toHaveBeenCalledOnce();
    expect(statuses).toContain('repairing');
    expect(frontendIndex).toBe(8);

    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1]?.emit('open', new Event('open'));
    expect(JSON.parse(sockets[1]?.sent[0] ?? '{}')).toEqual({
      replicaGenerationId: sourceIdentity.generationId,
      frontendIndex: 8,
    });
    sockets[1]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: sourceIdentity.generationId,
          frontendIndex: 8,
        }),
      }),
    );
    const release = await releasePromise;
    await Effect.runPromise(release);
    expect(releaseFrontendApi).toHaveBeenCalledOnce();
  });

  it('switches to matching target authority, releases source last, and reconnects at the target watermark', async () => {
    let frontendIndex = 4;
    const statuses: string[] = [];
    const releaseSourceFrontendApi = vi.fn();
    const releaseTargetFrontendApi = vi.fn();
    createFrontendWebSocketTicketMock
      .mockReturnValueOnce(
        Effect.succeed({
          ticket: 'successor-ticket',
          ...targetIdentity,
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          ticket: 'target-ticket',
          ...targetIdentity,
        }),
      );
    const order: string[] = [];
    const transitionToTarget = vi.fn(() =>
      Effect.sync(() => {
        order.push('transition');
        frontendIndex = 9;
        return {
          frontendApi: mockFrontendApi,
          releaseFrontendApi: releaseTargetFrontendApi,
          identity: targetIdentity,
        };
      }),
    );

    const releasePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi: releaseSourceFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => frontendIndex,
        replaceFrontendState: () => Effect.void,
        handleFrontendLineageBlock: lineageBlock =>
          Effect.sync(() => {
            order.push('boundary');
            frontendIndex =
              lineageBlock.kind === 'generation-boundary'
                ? lineageBlock.frontendIndex
                : lineageBlock.frontendBlock.frontendIndex;
          }),
        regainFrontendApi: () => Effect.succeed(null),
        transitionToTarget,
        handleAuthorityFailure: () => Effect.void,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]?.emit('open', new Event('open'));
    expect(JSON.parse(sockets[0]?.sent[0] ?? '{}')).toEqual({
      replicaGenerationId: sourceIdentity.generationId,
      frontendIndex: 4,
    });
    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'frontendBlock',
          sync: {
            kind: 'generation-boundary',
            systemId: sourceIdentity.systemId,
            prevGenerationId: sourceIdentity.generationId,
            generationId: targetIdentity.generationId,
            accountId: sourceIdentity.accountId,
            accountName: sourceIdentity.accountName,
            actorId: sourceIdentity.actorId,
            actorName: sourceIdentity.actorName,
            frontendName: sourceIdentity.frontendName,
            frontendIndex: 5,
          },
        }),
      }),
    );
    await vi.waitFor(() => expect(frontendIndex).toBe(5));

    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'lineage-transition-required',
          kind: 'lineage-transition-required',
          systemId: targetIdentity.systemId,
          generationId: targetIdentity.generationId,
          accountId: targetIdentity.accountId,
          accountName: targetIdentity.accountName,
          actorId: targetIdentity.actorId,
          actorName: targetIdentity.actorName,
          frontendName: targetIdentity.frontendName,
          frontendVersion: targetIdentity.frontendVersion,
          appliedBoundaryIndex: 5,
          remainingBoundaries: [],
        }),
      }),
    );
    await vi.waitFor(() => expect(transitionToTarget).toHaveBeenCalledOnce());
    expect(order).toEqual(['boundary', 'transition']);
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
    expect(releaseTargetFrontendApi).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1]?.emit('open', new Event('open'));
    expect(JSON.parse(sockets[1]?.sent[0] ?? '{}')).toEqual({
      replicaGenerationId: targetIdentity.generationId,
      frontendIndex: 9,
    });
    sockets[1]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: targetIdentity.generationId,
          frontendIndex: 9,
        }),
      }),
    );
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('online'));
    const release = await releasePromise;

    await Effect.runPromise(release);
    expect(releaseTargetFrontendApi).toHaveBeenCalledOnce();
  });

  it('retains source state and authority while exposing update-required for an unmatched target', async () => {
    let frontendIndex = 4;
    const statuses: string[] = [];
    const releaseSourceFrontendApi = vi.fn();
    createFrontendWebSocketTicketMock.mockReturnValue(
      Effect.succeed({
        ticket: 'successor-ticket',
        ...sourceIdentity,
        generationId: 'gen_target',
        frontendVersion: '2.0.0',
      }),
    );
    const transitionToTarget = vi.fn(() => Effect.succeed(null));

    const releasePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi: releaseSourceFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => frontendIndex,
        replaceFrontendState: () => Effect.void,
        handleFrontendLineageBlock: lineageBlock =>
          Effect.sync(() => {
            frontendIndex =
              lineageBlock.kind === 'generation-boundary'
                ? lineageBlock.frontendIndex
                : lineageBlock.frontendBlock.frontendIndex;
          }),
        regainFrontendApi: () => Effect.succeed(null),
        transitionToTarget,
        handleAuthorityFailure: () => Effect.void,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]?.emit('open', new Event('open'));
    expect(JSON.parse(sockets[0]?.sent[0] ?? '{}')).toEqual({
      replicaGenerationId: sourceIdentity.generationId,
      frontendIndex: 4,
    });

    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'frontendBlock',
          sync: {
            kind: 'generation-boundary',
            systemId: sourceIdentity.systemId,
            prevGenerationId: sourceIdentity.generationId,
            generationId: 'gen_target',
            accountId: sourceIdentity.accountId,
            accountName: sourceIdentity.accountName,
            actorId: sourceIdentity.actorId,
            actorName: sourceIdentity.actorName,
            frontendName: sourceIdentity.frontendName,
            frontendIndex: 5,
          },
        }),
      }),
    );
    await vi.waitFor(() => expect(frontendIndex).toBe(5));

    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'lineage-transition-required',
          kind: 'lineage-transition-required',
          systemId: sourceIdentity.systemId,
          generationId: 'gen_target',
          accountId: sourceIdentity.accountId,
          accountName: sourceIdentity.accountName,
          actorId: sourceIdentity.actorId,
          actorName: sourceIdentity.actorName,
          frontendName: sourceIdentity.frontendName,
          frontendVersion: '2.0.0',
          appliedBoundaryIndex: 5,
          remainingBoundaries: [],
        }),
      }),
    );
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('update-required'));
    const release = await releasePromise;
    expect(releaseSourceFrontendApi).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(1);
    await Effect.runPromise(release);
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
  });

  it('keeps consuming same-generation archive blocks while a fresh ticket requires newer frontend code', async () => {
    let frontendIndex = 4;
    const statuses: string[] = [];
    const releaseFrontendApi = vi.fn();
    const transitionToTarget = vi.fn(() => Effect.succeed(null));
    createFrontendWebSocketTicketMock.mockReturnValue(
      Effect.succeed({
        ticket: 'same-generation-new-version-ticket',
        ...sourceIdentity,
        frontendVersion: '2.0.0',
      }),
    );

    const releasePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => frontendIndex,
        replaceFrontendState: () => Effect.void,
        handleFrontendLineageBlock: lineageBlock =>
          Effect.sync(() => {
            frontendIndex =
              lineageBlock.kind === 'frontend'
                ? lineageBlock.frontendBlock.frontendIndex
                : lineageBlock.frontendIndex;
          }),
        regainFrontendApi: () => Effect.succeed(null),
        transitionToTarget,
        handleAuthorityFailure: () => Effect.void,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(statuses.at(-1)).toBe('update-required');
    sockets[0]?.emit('open', new Event('open'));
    expect(statuses.at(-1)).toBe('update-required');
    expect(JSON.parse(sockets[0]?.sent[0] ?? '{}')).toEqual({
      replicaGenerationId: sourceIdentity.generationId,
      frontendIndex: 4,
    });
    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'frontendBlock',
          sync: {
            kind: 'frontend',
            systemId: sourceIdentity.systemId,
            generationId: sourceIdentity.generationId,
            accountId: sourceIdentity.accountId,
            accountName: sourceIdentity.accountName,
            actorId: sourceIdentity.actorId,
            actorName: sourceIdentity.actorName,
            frontendName: sourceIdentity.frontendName,
            frontendBlock: {
              frontendName: sourceIdentity.frontendName,
              lastAccountCursor: 'acur_version_5',
              frontendIndex: 5,
              lastRebasedPushedCursor: null,
              delta: { inserted: [], updated: [], deleted: [] },
              pendingPushedCommands: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            },
          },
        }),
      }),
    );
    await vi.waitFor(() => expect(frontendIndex).toBe(5));
    expect(statuses.at(-1)).toBe('update-required');
    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: sourceIdentity.generationId,
          frontendIndex: 5,
        }),
      }),
    );

    const release = await releasePromise;
    expect(statuses.at(-1)).toBe('update-required');
    expect(transitionToTarget).not.toHaveBeenCalled();
    expect(fetchFrontendStateMock).not.toHaveBeenCalled();
    await Effect.runPromise(release);
    expect(releaseFrontendApi).toHaveBeenCalledOnce();
  });

  it('replaces a dead account capability without applying replacement state', async () => {
    const statuses: string[] = [];
    const releaseSourceFrontendApi = vi.fn();
    const releaseRegainedFrontendApi = vi.fn();
    const replaceFrontendState = vi.fn(() => Effect.void);
    const regainedFrontendApi = { ...mockFrontendApi };
    const regainFrontendApi = vi.fn(() =>
      Effect.succeed({
        frontendApi: regainedFrontendApi,
        releaseFrontendApi: releaseRegainedFrontendApi,
        identity: sourceIdentity,
      }),
    );
    createFrontendWebSocketTicketMock
      .mockReturnValueOnce(
        Effect.fail(
          new ZerospinError({
            code: 'frontend-admission-transport-failed',
            message: 'The original account capability transport is closed',
          }),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          ticket: 'regained-account-ticket',
          ...sourceIdentity,
        }),
      );

    const releasePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi: releaseSourceFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => 4,
        replaceFrontendState,
        handleFrontendLineageBlock: () => Effect.void,
        regainFrontendApi,
        transitionToTarget: () => Effect.succeed(null),
        handleAuthorityFailure: () => Effect.void,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    await vi.waitFor(() => expect(regainFrontendApi).toHaveBeenCalledOnce());
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
    expect(replaceFrontendState).not.toHaveBeenCalled();
    expect(fetchFrontendStateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(
      createFrontendWebSocketTicketMock.mock.calls[0]?.[0].frontendApi,
    ).toBe(mockFrontendApi);
    expect(
      createFrontendWebSocketTicketMock.mock.calls[1]?.[0].frontendApi,
    ).toBe(regainedFrontendApi);
    sockets[0]?.emit('open', new Event('open'));
    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: sourceIdentity.generationId,
          frontendIndex: 4,
        }),
      }),
    );
    const release = await releasePromise;
    expect(statuses.at(-1)).toBe('online');

    await Effect.runPromise(release);
    expect(releaseRegainedFrontendApi).toHaveBeenCalledOnce();
  });

  it('preserves the readable account database and stops at update-required when reauthentication finds only a newer version', async () => {
    const statuses: string[] = [];
    const releaseSourceFrontendApi = vi.fn();
    const replaceFrontendState = vi.fn(() => Effect.void);
    const regainFrontendApi = vi.fn(() => Effect.succeed(null));
    createFrontendWebSocketTicketMock.mockReturnValue(
      Effect.fail(
        new ZerospinError({
          code: 'frontend-admission-transport-failed',
          message: 'The original account capability transport is closed',
        }),
      ),
    );

    const release = await Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi: releaseSourceFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => 4,
        replaceFrontendState,
        handleFrontendLineageBlock: () => Effect.void,
        regainFrontendApi,
        transitionToTarget: () => Effect.succeed(null),
        handleAuthorityFailure: () => Effect.void,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(statuses.at(-1)).toBe('update-required');
    expect(regainFrontendApi).toHaveBeenCalledOnce();
    expect(replaceFrontendState).not.toHaveBeenCalled();
    expect(fetchFrontendStateMock).not.toHaveBeenCalled();
    expect(releaseSourceFrontendApi).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(createFrontendWebSocketTicketMock).toHaveBeenCalledOnce();

    await Effect.runPromise(release);
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
  });

  it('fails the direct account session closed when transport regain rejects its local signature', async () => {
    const statuses: string[] = [];
    const releaseSourceFrontendApi = vi.fn();
    const handleAuthorityFailure = vi.fn(() => Effect.void);
    const authorityFailure = new ZerospinError({
      code: 'frontend-transport-regain-signature-invalid',
      message: 'The account signature did not match the local schema',
    });
    createFrontendWebSocketTicketMock.mockReturnValue(
      Effect.fail(
        new ZerospinError({
          code: 'frontend-admission-transport-failed',
          message: 'The original account capability transport is closed',
        }),
      ),
    );

    const outcomePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi: releaseSourceFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => 4,
        replaceFrontendState: () => Effect.void,
        handleFrontendLineageBlock: () => Effect.void,
        regainFrontendApi: () => Effect.fail(authorityFailure),
        transitionToTarget: () => Effect.succeed(null),
        handleAuthorityFailure,
        setStatus: status => {
          statuses.push(status);
        },
      }).pipe(Effect.provide(TestLayer)),
    ).then(
      () => null,
      error => error,
    );

    await vi.waitFor(() =>
      expect(handleAuthorityFailure).toHaveBeenCalledWith(authorityFailure),
    );
    expect(await outcomePromise).not.toBeNull();
    expect(statuses.at(-1)).toBe('failed');
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(createFrontendWebSocketTicketMock).toHaveBeenCalledOnce();
  });

  it('retries account transport and operational reauthentication failures until a fresh capability succeeds', async () => {
    const releaseSourceFrontendApi = vi.fn();
    const releaseRegainedFrontendApi = vi.fn();
    const handleAuthorityFailure = vi.fn(() => Effect.void);
    const regainedFrontendApi = { ...mockFrontendApi };
    const transportFailure = new ZerospinError({
      code: 'frontend-admission-transport-failed',
      message: 'Account authority remains unreachable',
    });
    const operationalFailure = new ZerospinError({
      code: 'frontend-state-required',
      message: 'Account authority requested an ordinary state repair',
    });
    const regainFrontendApi = vi
      .fn()
      .mockReturnValueOnce(Effect.fail(operationalFailure))
      .mockReturnValueOnce(Effect.fail(transportFailure))
      .mockReturnValueOnce(
        Effect.succeed({
          frontendApi: regainedFrontendApi,
          releaseFrontendApi: releaseRegainedFrontendApi,
          identity: sourceIdentity,
        }),
      );
    createFrontendWebSocketTicketMock
      .mockReturnValueOnce(Effect.fail(transportFailure))
      .mockReturnValueOnce(Effect.fail(transportFailure))
      .mockReturnValueOnce(Effect.fail(transportFailure))
      .mockReturnValueOnce(
        Effect.succeed({
          ticket: 'eventually-regained-account-ticket',
          ...sourceIdentity,
        }),
      );

    const releasePromise = Effect.runPromise(
      acquireFrontendWebSocket({
        frontend,
        frontendApi: mockFrontendApi,
        releaseFrontendApi: releaseSourceFrontendApi,
        identity: sourceIdentity,
        getFrontendIndex: () => 4,
        replaceFrontendState: () => Effect.void,
        handleFrontendLineageBlock: () => Effect.void,
        regainFrontendApi,
        transitionToTarget: () => Effect.succeed(null),
        handleAuthorityFailure,
        setStatus: () => undefined,
      }).pipe(Effect.provide(TestLayer)),
    );

    await vi.waitFor(() => expect(regainFrontendApi).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(regainFrontendApi).toHaveBeenCalledTimes(2));
    expect(handleAuthorityFailure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(regainFrontendApi).toHaveBeenCalledTimes(3));
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]?.emit('open', new Event('open'));
    sockets[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'replay-complete',
          generationId: sourceIdentity.generationId,
          frontendIndex: 4,
        }),
      }),
    );
    const release = await releasePromise;

    await Effect.runPromise(release);
    expect(releaseRegainedFrontendApi).toHaveBeenCalledOnce();
  });
});
