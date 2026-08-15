import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { main } from '@zerospin/core/fixtures/system';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeSession } from '@zerospin/core/session/makeSession';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Layer } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapBrowserServiceSession } from './bootstrapBrowserServiceSession';
import { bootstrapBrowserSession } from './bootstrapBrowserSession';

const serviceFrontend = makeFrontendController({
  systemName: 'system-worker',
  serviceName: 'catalog',
  frontendName: 'catalog',
  models: {},
});

const TestLayer = Layer.mergeAll(
  AsyncLive,
  IncrementalMonotonicFactory,
  makePrefixedIncrementalIdFactory('bootstrap-capability'),
  makeTelemetryLayer(makeTelemetryCollector()),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser UserPartitionRepo capability ownership', () => {
  it('acquires and releases one exact aggregate replica without releasing sibling capabilities', async () => {
    const frontendSpec = makeFrontendControllerSpec(main);
    const aggregateFrontendLockKey = await Effect.runPromise(
      makeAggregateFrontendLockKey(frontendSpec.aggregateFrontendLock),
    );
    const releaseAggregateReplica = vi.fn(async () => encodeRight(undefined));
    const releaseServiceReplica = vi.fn(async () => encodeRight(undefined));
    const disposePromotedReplica = vi.fn();
    const acquireAggregateFrontendReplica = vi
      .fn()
      .mockResolvedValueOnce(
        encodeRight({
          getState: vi.fn(async () =>
            encodeRight({
              aggregateId: 'acct_1',
              aggregateName: main.aggregateName,
              userId: 'usr_1',
              systemId: 'sys_1',
              systemVersion: '1.0.0',
              frontendName: main.frontendName,
              aggregateFrontendLockKey,
              frontendIndex: 0,
              replicaIndex: 0,
              pushedCommands: [],
              stagedCommands: [],
              failedStagedCommands: [],
              optimisticAppliedMutations: [],
              resources: [],
              executedPushedCommands: [],
              failedPushedCommands: [],
            }),
          ),
          release: releaseAggregateReplica,
        }),
      )
      .mockResolvedValueOnce(
        encodeRight({
          release: vi.fn(async () => encodeRight(undefined)),
          [Symbol.dispose]: disposePromotedReplica,
        }),
      );
    const transportEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      transportEvents.addEventListener.bind(transportEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      transportEvents.removeEventListener.bind(transportEvents),
    );
    const session = makeSession({
      frontend: main,
      sessionId: 'sesn_aggregate_capability',
    });

    const browserSession = await Effect.runPromise(
      bootstrapBrowserSession({
        session,
        aggregateId: 'acct_1',
        userId: 'usr_1',
        systemId: 'sys_1',
        mode: 'existing-only',
        userReplicaApi: {
          acquireAggregateFrontendReplica,
          acquireServiceFrontendReplica: vi.fn(async () =>
            encodeRight({ release: releaseServiceReplica }),
          ),
          stageAggregateFrontendCommand: vi.fn(),
          listAggregateFrontendReplicas: vi.fn(),
          listServiceFrontendReplicas: vi.fn(),
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(acquireAggregateFrontendReplica).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'acct_1',
        aggregateName: main.aggregateName,
        frontendName: main.frontendName,
        mode: 'existing-only',
      }),
    );
    expect(session.store.getState().workerState.status).toBe('offline');

    transportEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(acquireAggregateFrontendReplica).toHaveBeenCalledTimes(2);
      expect(session.store.getState().workerState.status).toBe('online');
    });
    const initialRequest = acquireAggregateFrontendReplica.mock.calls[0]?.[0];
    const promotionRequest = acquireAggregateFrontendReplica.mock.calls[1]?.[0];
    if (initialRequest === undefined || promotionRequest === undefined) {
      throw new Error('Aggregate acquisition requests were not captured');
    }
    expect(promotionRequest).toMatchObject({
      aggregateId: 'acct_1',
      mode: 'online',
    });
    expect(promotionRequest.sink).toBe(initialRequest.sink);
    expect(disposePromotedReplica).toHaveBeenCalledOnce();
    expect(releaseAggregateReplica).not.toHaveBeenCalled();

    await Effect.runPromise(browserSession.releaseBrowserSession);
    await Effect.runPromise(browserSession.releaseBrowserSession);
    expect(releaseAggregateReplica).toHaveBeenCalledOnce();
    expect(releaseServiceReplica).not.toHaveBeenCalled();
    expect(session.store.getState().workerState.status).toBe('released');
  });

  it('acquires and releases one exact service replica without releasing aggregate capabilities', async () => {
    const frontendSpec = makeFrontendControllerSpec(serviceFrontend);
    const serviceFrontendLockKey = await Effect.runPromise(
      makeServiceFrontendLockKey(frontendSpec.serviceFrontendLock),
    );
    const releaseAggregateReplica = vi.fn(async () => encodeRight(undefined));
    const releaseServiceReplica = vi.fn(async () => encodeRight(undefined));
    const disposePromotedReplica = vi.fn();
    const acquireServiceFrontendReplica = vi
      .fn()
      .mockResolvedValueOnce(
        encodeRight({
          getState: vi.fn(async () =>
            encodeRight({
              userId: 'usr_1',
              systemId: 'sys_1',
              systemVersion: '1.0.0',
              serviceName: serviceFrontend.serviceName,
              frontendName: serviceFrontend.frontendName,
              serviceFrontendLockKey,
              frontendIndex: 0,
              replicaIndex: 0,
              resources: [],
            }),
          ),
          release: releaseServiceReplica,
        }),
      )
      .mockResolvedValueOnce(
        encodeRight({
          release: vi.fn(async () => encodeRight(undefined)),
          [Symbol.dispose]: disposePromotedReplica,
        }),
      );
    const transportEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      transportEvents.addEventListener.bind(transportEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      transportEvents.removeEventListener.bind(transportEvents),
    );
    const session = makeServiceSession({
      frontend: serviceFrontend,
      sessionId: 'sesn_service_capability',
    });

    const browserSession = await Effect.runPromise(
      bootstrapBrowserServiceSession({
        session,
        userId: 'usr_1',
        systemId: 'sys_1',
        mode: 'existing-only',
        userReplicaApi: {
          acquireAggregateFrontendReplica: vi.fn(async () =>
            encodeRight({ release: releaseAggregateReplica }),
          ),
          acquireServiceFrontendReplica,
          stageAggregateFrontendCommand: vi.fn(),
          listAggregateFrontendReplicas: vi.fn(),
          listServiceFrontendReplicas: vi.fn(),
        },
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(acquireServiceFrontendReplica).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: serviceFrontend.serviceName,
        frontendName: serviceFrontend.frontendName,
        mode: 'existing-only',
      }),
    );
    expect(session.store.getState().workerState.status).toBe('offline');

    transportEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(acquireServiceFrontendReplica).toHaveBeenCalledTimes(2);
      expect(session.store.getState().workerState.status).toBe('online');
    });
    const initialRequest = acquireServiceFrontendReplica.mock.calls[0]?.[0];
    const promotionRequest = acquireServiceFrontendReplica.mock.calls[1]?.[0];
    if (initialRequest === undefined || promotionRequest === undefined) {
      throw new Error('Service acquisition requests were not captured');
    }
    expect(promotionRequest).toMatchObject({
      mode: 'online',
      serviceName: serviceFrontend.serviceName,
    });
    expect(promotionRequest.sink).toBe(initialRequest.sink);
    expect(disposePromotedReplica).toHaveBeenCalledOnce();
    expect(releaseServiceReplica).not.toHaveBeenCalled();

    await Effect.runPromise(browserSession.releaseBrowserSession);
    await Effect.runPromise(browserSession.releaseBrowserSession);
    expect(releaseServiceReplica).toHaveBeenCalledOnce();
    expect(releaseAggregateReplica).not.toHaveBeenCalled();
    expect(session.store.getState().workerState.status).toBe('released');
  });
});
