import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
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

  it('shows worker state, Database, and Logs without account command or push controls', async () => {
    const models = {};
    const dbConfig = makeResourceDbConfig({ models, otherTables: {} });
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const session = makeServiceSession({
      frontend: {
        systemName: 'shopping',
        serviceName: 'catalog',
        actorName: 'product',
        frontendName: 'browse',
        version: '1.0.0',
        models,
        modelNames: [],
        signature: Schema.Struct({ userId: Schema.String }),
      },
      sessionId: serviceSessionId,
      mode: 'shared-worker',
    });
    session.store.setState({
      sessionId: serviceSessionId,
      actorId: 'actr_service_pane',
      systemId: 'sys_service_pane',
      generationId: 'generation_service_pane',
      systemVersion: '1.0.0',
      systemWorkerName: 'shopping-worker',
      serviceName: 'catalog',
      actorName: 'product',
      frontendName: 'browse',
      frontendVersion: '1.0.0',
      db,
      schema: dbConfig.schema,
      models,
      isInitialized: true,
      frontendIndex: 12,
      replicaIndex: 15,
      workerState: {
        mode: 'shared-worker',
        status: 'replaying',
        bootstrapSource: 'replica',
        frontendIndex: 12,
        replicaIndex: 15,
        databaseName: 'service-pane.db',
        failure: null,
      },
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
    expect(container.textContent).toContain('mode: shared-worker');
    expect(container.textContent).toContain('status: replaying');
    expect(container.textContent).toContain('bootstrap: replica');
    expect(container.textContent).toContain('frontend index: 12');
    expect(container.textContent).toContain('replica index: 15');
    expect(container.textContent).toContain('database: service-pane.db');
  });
});
