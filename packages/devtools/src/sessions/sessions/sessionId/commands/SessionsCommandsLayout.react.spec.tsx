import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { main, mainModels } from '@zerospin/core/fixtures/system';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import {
  createMemoryRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zerospinDevtoolsStore } from '../../../../zerospinDevtoolsStore.js';

import { SessionsCommandsLayout } from './SessionsCommandsLayout';

const sessionId = 'sesn_commands_layout' as ISessionId;

describe('SessionsCommandsLayout', () => {
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
    zerospinDevtoolsStore.getState().removeAggregateSession(sessionId);
    container.remove();
    vi.clearAllMocks();
  });

  it('renders active commands from session otherTables query relations', async () => {
    const models = mainModels;
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoTables,
    });
    const schema = dbConfig.schema;
    const db = await Effect.runPromise(
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    expect(typeof db.query.commandJournal!.findMany).toBe('function');

    const session = makeSession({
      frontend: main,
      sessionId,
    });

    session.store.setState({
      sessionId,
      aggregateId: 'acct_1',
      aggregateName: main.aggregateName,
      userId: 'usr_1',
      systemId: 'sys_commands_layout',
      systemVersion: '1.0.0',
      frontendName: main.frontendName,
      aggregateFrontendLockKey: 'a'.repeat(64),
      db,
      schema,
      models,
      isInitialized: true,
      aggregateIndex: 0,
      frontendIndex: 0,
      pushIndex: 0,
      sessionStatus: 'current',
      backupState: { status: 'ready', failure: null },
    });
    zerospinDevtoolsStore.getState().addAggregateSession({
      session,
      getPushPaused: async () => ({ _tag: 'Success', success: false }),
      setPushPaused: async () => ({ _tag: 'Success', success: undefined }),
      pushNow: async () => ({
        _tag: 'Success',
        success: { status: 'empty' },
      }),
    });

    const router = createMemoryRouter(
      createRoutesFromElements(
        <Route
          path="/:sessionId/commands"
          element={<SessionsCommandsLayout />}
        />,
      ),
      { initialEntries: [`/${sessionId}/commands`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('No rows.');
    });
  });
});
