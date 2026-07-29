import { main } from '@zerospin/core/fixtures/system';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { makeSession } from '@zerospin/core/session/makeSession';
import { Effect, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { zerospinDevtoolsStore } from './zerospinDevtoolsStore.js';

const accountSessionId = 'sesn_devtools_account';
const serviceSessionId = 'sesn_devtools_service';

describe('zerospinDevtoolsStore session ownership', () => {
  afterEach(() => {
    zerospinDevtoolsStore.getState().removeAccountSession(accountSessionId);
    zerospinDevtoolsStore.getState().removeServiceSession(serviceSessionId);
  });

  it('registers account and service sessions in separate maps', () => {
    const accountSession = makeSession({
      frontend: main,
      sessionId: accountSessionId,
      generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
    });
    const serviceSession = makeServiceSession({
      frontend: {
        systemName: 'shopping',
        serviceName: 'catalog',
        actorName: 'product',
        frontendName: 'browse',
        version: '1.0.0',
        models: {},
        modelNames: [],
        signature: Schema.Struct({ userId: Schema.String }),
      },
      sessionId: serviceSessionId,
      mode: 'shared-worker',
    });

    zerospinDevtoolsStore.getState().addAccountSession({
      session: accountSession,
      pushStagedCommands: async () => ({
        pendingCommands: [],
        pushedCommands: [],
        failedCommands: [],
      }),
    });
    zerospinDevtoolsStore.getState().addServiceSession({
      session: serviceSession,
    });

    expect(
      zerospinDevtoolsStore.getState().accountSessionsById.get(accountSessionId)
        ?.session,
    ).toBe(accountSession);
    expect(
      zerospinDevtoolsStore.getState().serviceSessionsById.get(serviceSessionId)
        ?.sessionId,
    ).toBe(serviceSessionId);
    expect(
      zerospinDevtoolsStore
        .getState()
        .accountSessionsById.has(serviceSessionId),
    ).toBe(false);
    expect(
      zerospinDevtoolsStore
        .getState()
        .serviceSessionsById.has(accountSessionId),
    ).toBe(false);

    zerospinDevtoolsStore.getState().removeAccountSession(accountSessionId);

    expect(zerospinDevtoolsStore.getState().accountSessionsById.size).toBe(0);
    expect(
      zerospinDevtoolsStore.getState().serviceSessionsById.get(serviceSessionId)
        ?.sessionId,
    ).toBe(serviceSessionId);
  });
});
