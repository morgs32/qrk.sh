import { main } from '@zerospin/core/fixtures/system';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Effect, Exit, Layer, ManagedRuntime, Schema, Scope } from 'effect';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { zerospinDevtoolsStore } from './zerospinDevtoolsStore.js';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const aggregateSessionId = 'sesn_devtools_aggregate';
const serviceSessionId = 'sesn_devtools_service';

describe('zerospinDevtoolsStore session ownership', () => {
  afterEach(() => {
    zerospinDevtoolsStore.getState().removeAggregateSession(aggregateSessionId);
    zerospinDevtoolsStore.getState().removeServiceSession(serviceSessionId);
    zerospinDevtoolsStore
      .getState()
      .removeServiceSession('sesn_devtools_renewed');
  });

  it('registers account and service sessions in separate maps', () => {
    const aggregateSession = Effect.runSync(
      Effect.map(main.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend: main,
          sessionId: aggregateSessionId,
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
    const serviceSession = makeServiceSession({
      frontend: {
        systemName: 'shopping',
        serviceName: 'catalog',
        frontendName: 'browse',
        kind: 'service',
        contracts: {},
        models: {},
        modelNames: [],
        signature: Schema.Struct({ userId: Schema.String }),
      },
      models: {},
      sessionId: serviceSessionId,
    });

    zerospinDevtoolsStore.getState().addAggregateSession({
      session: aggregateSession,
      getPushPaused: async () => ({ _tag: 'Success', success: false }),
      setPushPaused: async () => ({ _tag: 'Success', success: undefined }),
      pushNow: async () => ({
        _tag: 'Success',
        success: { status: 'empty' },
      }),
    });
    zerospinDevtoolsStore.getState().addServiceSession({
      session: serviceSession,
    });

    expect(
      zerospinDevtoolsStore
        .getState()
        .aggregateSessionsById.get(aggregateSessionId)?.session,
    ).toBe(aggregateSession);
    expect(
      zerospinDevtoolsStore.getState().serviceSessionsById.get(serviceSessionId)
        ?.sessionId,
    ).toBe(serviceSessionId);
    expect(
      zerospinDevtoolsStore
        .getState()
        .aggregateSessionsById.has(serviceSessionId),
    ).toBe(false);
    expect(
      zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.has(aggregateSessionId),
    ).toBe(false);

    zerospinDevtoolsStore.getState().removeAggregateSession(aggregateSessionId);

    expect(zerospinDevtoolsStore.getState().aggregateSessionsById.size).toBe(0);
    expect(
      zerospinDevtoolsStore.getState().serviceSessionsById.get(serviceSessionId)
        ?.sessionId,
    ).toBe(serviceSessionId);

    const originalServiceStore = serviceSession.store;
    serviceSession.store.setState({ sessionId: 'sesn_devtools_renewed' });
    zerospinDevtoolsStore.getState().removeServiceSession(serviceSessionId);
    zerospinDevtoolsStore
      .getState()
      .addServiceSession({ session: serviceSession });
    expect(serviceSession.store).toBe(originalServiceStore);
    expect(serviceSession.sessionId).toBe('sesn_devtools_renewed');
    expect(
      zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.has(serviceSessionId),
    ).toBe(false);
    expect(
      zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.get('sesn_devtools_renewed')?.sessionId,
    ).toBe('sesn_devtools_renewed');
  });
});
