import { main } from '@zerospin/core/fixtures/system';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeSession } from '@zerospin/core/session/makeSession';
import { Effect, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { zerospinDevtoolsStore } from './zerospinDevtoolsStore.js';

const aggregateSessionId = 'sesn_devtools_aggregate';
const serviceSessionId = 'sesn_devtools_service';

describe('zerospinDevtoolsStore session ownership', () => {
  afterEach(() => {
    zerospinDevtoolsStore.getState().removeAggregateSession(aggregateSessionId);
    zerospinDevtoolsStore.getState().removeServiceSession(serviceSessionId);
  });

  it('registers account and service sessions in separate maps', () => {
    const aggregateSession = makeSession({
      frontend: main,
      sessionId: aggregateSessionId,
      generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
    });
    const serviceSession = makeServiceSession({
      frontend: {
        systemName: 'shopping',
        serviceName: 'catalog',
        frontendName: 'browse',
        kind: 'service',
        contracts: {},
        guards: {},
        models: {},
        modelNames: [],
        signature: Schema.Struct({ userId: Schema.String }),
      },
      sessionId: serviceSessionId,
      mode: 'shared-worker',
    });

    zerospinDevtoolsStore.getState().addAggregateSession({
      session: aggregateSession,
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
  });
});
