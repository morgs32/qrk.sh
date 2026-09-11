import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { main } from '@zerospin/core/fixtures/system';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { Effect, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { zerospinDevtoolsStore } from '../../../zerospinDevtoolsStore.js';

import { SessionPane } from './SessionPane.js';

const serviceSessionId = 'sesn_service_pane';

describe('SessionPane service surface', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    zerospinDevtoolsStore.getState().removeServiceSession(serviceSessionId);
    container.remove();
  });

  it('shows worker state, Database, and Logs without aggregate command or push controls', async () => {
    const models = {};
    const dbConfig = makeResourceDbConfig({ models, otherTables: {} });
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const session = makeServiceSession({
      frontend: {
        systemName: 'shopping',
        serviceName: 'catalog',
        name: 'browse',
        serviceVersion: '1.0.0',
        kind: 'service',
        contracts: {},
        models,
        modelNames: [],
        authentication: {
          signatureSchema: Schema.Struct({ userId: Schema.String }),
          authenticationSchema: Schema.Struct({ userId: Schema.String }),
          selectionSchema: Schema.Struct({ userId: Schema.String }),
          pattern: main.authentication.pattern,
        },
      },
      models,
      sessionId: serviceSessionId,
    });
    session.store.setState({
      sessionId: serviceSessionId,
      authentication: { userId: 'user_service_pane' },
      systemId: 'sys_service_pane',
      serviceName: 'catalog',
      serviceVersion: '1.0.0',
      frontendName: 'browse',
      serviceFrontendLockKey: 'b'.repeat(64),
      db,
      schema: dbConfig.schema,
      models,
      isInitialized: true,
      serviceIndex: 12,
      sessionStatus: 'current',
      backupState: { status: 'repairing', failure: null },
    });
    zerospinDevtoolsStore.getState().addServiceSession({ session });

    const router = createMemoryRouter(
      [
        {
          path: '/:sessionId/*',
          element: <SessionPane />,
        },
      ],
      { initialEntries: [`/${serviceSessionId}/database`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Database');
    expect(container.textContent).toContain('Logs');
    expect(container.textContent).not.toContain('Commands');
    expect(container.textContent).not.toContain('Pause push');
    expect(container.textContent).not.toContain('Push');
    expect(container.textContent).toContain('session: current');
    expect(container.textContent).toContain('backup: repairing');
    expect(container.textContent).toContain('service index: 12');
    expect(container.textContent).toContain('service frontend index: 12');
  });
});
