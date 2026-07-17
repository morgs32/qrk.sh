import { act, useEffect, useState } from 'react';

import type { IServiceQuery } from '@zerospin/core/actorController/types';
import { List, main, User } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/core/models/primitives';
import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import type * as Capnweb from 'capnweb';
import { Either, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeReactFrontend } from './makeReactFrontend';
import { makeMockProvider } from './mock';
import { useApi } from './useApi';
import { useInitializedStateOrThrow } from './useInitializedStateOrThrow';
import { useLiveQuery } from './useLiveQuery';
import { useSession } from './useSession';

const sqliteCloseBoundary = vi.hoisted(() => vi.fn());
const sqliteInitialization = vi.hoisted(() => ({
  entered: vi.fn(),
  wait: Promise.resolve(),
}));
const newHttpBatchRpcSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/core/drizzle/makeInMemorySQLite3', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@zerospin/core/drizzle/makeInMemorySQLite3')
    >();

  return {
    ...actual,
    async makeInMemorySQLite3(
      ...args: Parameters<typeof actual.makeInMemorySQLite3>
    ) {
      sqliteInitialization.entered();
      await sqliteInitialization.wait;
      const client = await actual.makeInMemorySQLite3(...args);
      const close = client.sqlite3.close.bind(client.sqlite3);
      vi.spyOn(client.sqlite3, 'close').mockImplementation(db => {
        sqliteCloseBoundary(db);
        return close(db);
      });
      return client;
    },
  };
});

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

const ReactMain = makeReactFrontend({
  frontend: main,
});
const MockMainProvider = makeMockProvider({
  reactFrontend: ReactMain,
});
const fixtureDate = new Date('2026-01-01T00:00:00.000Z');
const remoteParamsSchema = Schema.Struct({
  limit: Schema.Number,
});
const JsonDocument = makeModel(
  {
    abbreviation: 'doc',
    modelName: 'document',
    attributes: {
      metadata: primitives.json({
        schema: Schema.Struct({
          label: Schema.String,
        }),
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
const jsonFrontend = makeFrontendController({
  contracts: {},
  models: {
    document: JsonDocument,
  },
  accountName: 'user',
  actorName: 'jsonFixture',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'mock-json-fixture-test',
  signature: Schema.Struct({}),
});
const ReactJsonFixture = makeReactFrontend({
  frontend: jsonFrontend,
});
const MockJsonFixtureProvider = makeMockProvider({
  reactFrontend: ReactJsonFixture,
});

describe('makeMockProvider', () => {
  let container: HTMLDivElement;
  let root: Root;
  let didUnmount: boolean;
  let uncaughtErrors: unknown[];

  beforeEach(() => {
    sqliteCloseBoundary.mockClear();
    sqliteInitialization.entered.mockClear();
    sqliteInitialization.wait = Promise.resolve();
    newHttpBatchRpcSessionMock.mockClear();
    uncaughtErrors = [];
    didUnmount = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container, {
      onUncaughtError(error) {
        uncaughtErrors.push(error);
      },
    });
  });

  afterEach(async () => {
    if (!didUnmount) {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
    }
    container.remove();
  });

  it('gates children until real SQLite initialization and publishes typed seeded and empty models', async () => {
    const Probe = () => {
      const session = useSession(ReactMain);
      const state = useInitializedStateOrThrow(ReactMain);
      const users = useLiveQuery(ReactMain, {
        query: db =>
          db.query.user.findMany({
            with: {
              lists: true,
            },
          }),
      });
      const items = useLiveQuery(ReactMain, {
        query: db => db.query.item.findMany(),
      });
      const accounts = useLiveQuery(ReactMain, {
        query: db => db.query.account.findMany(),
      });

      return (
        <output
          data-testid="ready"
          data-account-id={state.accountId}
          data-actor-id={state.actorId}
          data-generation-id={state.generationId}
          data-session-id={session.sessionId}
          data-shared-worker={String(
            session.browserUserController.isSharedWorkerEnabled,
          )}
          data-system-version={state.systemVersion}
          data-system-worker-name={state.systemWorkerName}
          data-user-id={session.browserUserController.userId}
        >
          {JSON.stringify({
            accounts: accounts.data,
            items: items.data,
            users: users.data,
          })}
        </output>
      );
    };

    act(() => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
          resources={{
            user: [
              {
                actorId: 'actr_1',
                createdAt: fixtureDate,
                id: 'usr_1',
                modelName: User.modelName,
                name: 'User 1',
                updatedAt: fixtureDate,
                version: User.version,
              },
            ],
            list: [
              {
                createdAt: fixtureDate,
                id: 'lst_1',
                modelName: List.modelName,
                name: 'List 1',
                updatedAt: fixtureDate,
                userId: 'usr_1',
                version: List.version,
              },
            ],
          }}
        >
          <Probe />
        </MockMainProvider>,
      );
    });

    expect(container.querySelector('[data-testid="ready"]')).toBeNull();

    await vi.waitFor(
      () => {
        expect(uncaughtErrors).toEqual([]);
        expect(container.querySelector('[data-testid="ready"]')).not.toBeNull();
      },
      { timeout: 10_000 },
    );

    const output = container.querySelector('[data-testid="ready"]');
    expect(output?.getAttribute('data-account-id')).toBe('acct_1');
    expect(output?.getAttribute('data-actor-id')).toBe('actr_1');
    expect(output?.getAttribute('data-generation-id')).toBe('gen_1');
    expect(output?.getAttribute('data-session-id')).toMatch(/^sesn_/);
    expect(output?.getAttribute('data-shared-worker')).toBe('false');
    expect(output?.getAttribute('data-system-version')).toBe('1.0.0');
    expect(output?.getAttribute('data-system-worker-name')).toBe('worker_1');
    expect(output?.getAttribute('data-user-id')).toBe('browser_user_1');
    expect(output?.textContent).toContain('User 1');
    expect(output?.textContent).toContain('List 1');
    expect(output?.textContent).toContain('"items":[]');
    expect(output?.textContent).toContain('"accounts":[]');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    didUnmount = true;

    await vi.waitFor(() => {
      expect(sqliteCloseBoundary).toHaveBeenCalledTimes(1);
    });
  });

  it('migrates every model table as empty when resources are omitted', async () => {
    const EmptyModelsProbe = () => {
      const accounts = useLiveQuery(ReactMain, {
        query: db => db.query.account.findMany(),
      });
      const items = useLiveQuery(ReactMain, {
        query: db => db.query.item.findMany(),
      });
      const lists = useLiveQuery(ReactMain, {
        query: db => db.query.list.findMany(),
      });
      const users = useLiveQuery(ReactMain, {
        query: db => db.query.user.findMany(),
      });

      return (
        <output data-testid="empty-models">
          {JSON.stringify({
            accountCount: accounts.data.length,
            itemCount: items.data.length,
            listCount: lists.data.length,
            userCount: users.data.length,
          })}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
        >
          <EmptyModelsProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="empty-models"]')?.textContent,
        ).toBe('{"accountCount":0,"itemCount":0,"listCount":0,"userCount":0}');
      },
      { timeout: 10_000 },
    );
  });

  it('encodes a decoded JSON fixture for the real Drizzle row', async () => {
    const JsonFixtureProbe = () => {
      const documents = useLiveQuery(ReactJsonFixture, {
        query: db => db.query.document.findMany(),
      });

      return (
        <output data-testid="json-fixture">
          {documents.data[0]?.metadata ?? 'pending'}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockJsonFixtureProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
          resources={{
            document: [
              {
                createdAt: fixtureDate,
                id: 'doc_1',
                metadata: {
                  label: 'Decoded JSON fixture',
                },
                modelName: JsonDocument.modelName,
                updatedAt: fixtureDate,
                version: JsonDocument.version,
              },
            ],
          }}
        >
          <JsonFixtureProbe />
        </MockJsonFixtureProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="json-fixture"]')?.textContent,
      ).toBe('{"label":"Decoded JSON fixture"}');
    });
  });

  it('runs real optimistic staging, writes lifecycle rows, and invalidates a live query without RPC or push', async () => {
    const listSnapshots: string[] = [];

    const StagingProbe = () => {
      const session = useSession(ReactMain);
      const lists = useLiveQuery(ReactMain, {
        query: db => db.query.list.findMany(),
      });
      const [optimisticRowCount, setOptimisticRowCount] = useState(0);
      const [stageResult, setStageResult] = useState('pending');
      const [stagedRowCount, setStagedRowCount] = useState(0);

      useEffect(() => {
        listSnapshots.push(lists.data.map(list => list.name).join(','));
      }, [lists.data]);

      useEffect(() => {
        void session
          .stageCommand({
            contractName: 'createList',
            payload: {
              id: 'lst_staged',
              name: 'Staged List',
              userId: 'usr_1',
            },
          })
          .then(result => {
            setStageResult(result._tag);
            const state = session.store.getState();
            if (state.isInitialized) {
              setOptimisticRowCount(
                state.db
                  .select()
                  .from(sessionOptimisticAppliedMutationDrizzleSchema)
                  .all().length,
              );
              setStagedRowCount(
                state.db.select().from(sessionStagedCommandDrizzleSchema).all()
                  .length,
              );
            }
          });
      }, [session]);

      return (
        <output
          data-testid="staging"
          data-has-core-push={String(
            'pushQueue' in session.coreSession ||
              'pushStagedCommands' in session.coreSession,
          )}
          data-optimistic-row-count={optimisticRowCount}
          data-stage-result={stageResult}
          data-staged-row-count={stagedRowCount}
        >
          {lists.data.map(list => list.name).join(',')}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
          resources={{
            user: [
              {
                actorId: 'actr_1',
                createdAt: fixtureDate,
                id: 'usr_1',
                modelName: User.modelName,
                name: 'User 1',
                updatedAt: fixtureDate,
                version: User.version,
              },
            ],
          }}
        >
          <StagingProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        const output = container.querySelector('[data-testid="staging"]');
        expect(output?.getAttribute('data-stage-result')).toBe('Right');
        expect(output?.getAttribute('data-optimistic-row-count')).toBe('1');
        expect(output?.getAttribute('data-staged-row-count')).toBe('1');
        expect(output?.getAttribute('data-has-core-push')).toBe('false');
        expect(output?.textContent).toContain('Staged List');
      },
      { timeout: 10_000 },
    );

    expect(listSnapshots).toContain('');
    expect(listSnapshots.at(-1)).toBe('Staged List');
    expect(newHttpBatchRpcSessionMock).not.toHaveBeenCalled();
  });

  it('captures fixture and identity props once and uses a new key as the reset boundary', async () => {
    const IdentityProbe = () => {
      const session = useSession(ReactMain);
      const state = useInitializedStateOrThrow(ReactMain);
      const users = useLiveQuery(ReactMain, {
        query: db => db.query.user.findMany(),
      });

      return (
        <output
          data-testid="identity"
          data-account-id={state.accountId}
          data-actor-id={state.actorId}
          data-browser-user-id={session.browserUserController.userId}
          data-generation-id={state.generationId}
          data-system-version={state.systemVersion}
          data-system-worker-name={state.systemWorkerName}
        >
          {users.data.map(user => user.name).join(',')}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
          resources={{
            user: [
              {
                actorId: 'actr_1',
                createdAt: fixtureDate,
                id: 'usr_1',
                modelName: User.modelName,
                name: 'Original User',
                updatedAt: fixtureDate,
                version: User.version,
              },
            ],
          }}
        >
          <IdentityProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="identity"]')?.textContent,
        ).toContain('Original User');
      },
      { timeout: 10_000 },
    );

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="browser_user_2"
          accountId="acct_2"
          actorId="actr_2"
          generationId="gen_2"
          systemVersion="2.0.0"
          systemWorkerName="worker_2"
          resources={{
            user: [
              {
                actorId: 'actr_2',
                createdAt: fixtureDate,
                id: 'usr_2',
                modelName: User.modelName,
                name: 'Replacement User',
                updatedAt: fixtureDate,
                version: User.version,
              },
            ],
          }}
        >
          <IdentityProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    const unchangedOutput = container.querySelector('[data-testid="identity"]');
    expect(unchangedOutput?.getAttribute('data-account-id')).toBe('acct_1');
    expect(unchangedOutput?.getAttribute('data-actor-id')).toBe('actr_1');
    expect(unchangedOutput?.getAttribute('data-browser-user-id')).toBe(
      'browser_user_1',
    );
    expect(unchangedOutput?.getAttribute('data-generation-id')).toBe('gen_1');
    expect(unchangedOutput?.getAttribute('data-system-version')).toBe('1.0.0');
    expect(unchangedOutput?.getAttribute('data-system-worker-name')).toBe(
      'worker_1',
    );
    expect(unchangedOutput?.textContent).toContain('Original User');
    expect(unchangedOutput?.textContent).not.toContain('Replacement User');

    await act(async () => {
      root.render(
        <MockMainProvider
          key="reset"
          userId="browser_user_2"
          accountId="acct_2"
          actorId="actr_2"
          generationId="gen_2"
          systemVersion="2.0.0"
          systemWorkerName="worker_2"
          resources={{
            user: [
              {
                actorId: 'actr_2',
                createdAt: fixtureDate,
                id: 'usr_2',
                modelName: User.modelName,
                name: 'Replacement User',
                updatedAt: fixtureDate,
                version: User.version,
              },
            ],
          }}
        >
          <IdentityProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        const resetOutput = container.querySelector('[data-testid="identity"]');
        expect(resetOutput?.getAttribute('data-account-id')).toBe('acct_2');
        expect(resetOutput?.getAttribute('data-actor-id')).toBe('actr_2');
        expect(resetOutput?.getAttribute('data-browser-user-id')).toBe(
          'browser_user_2',
        );
        expect(resetOutput?.getAttribute('data-generation-id')).toBe('gen_2');
        expect(resetOutput?.getAttribute('data-system-version')).toBe('2.0.0');
        expect(resetOutput?.getAttribute('data-system-worker-name')).toBe(
          'worker_2',
        );
        expect(resetOutput?.textContent).toContain('Replacement User');
        expect(sqliteCloseBoundary).toHaveBeenCalledTimes(1);
      },
      { timeout: 10_000 },
    );

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    didUnmount = true;

    await vi.waitFor(() => {
      expect(sqliteCloseBoundary).toHaveBeenCalledTimes(2);
    });
  });

  it('fails an actor API before constructing an RPC session', async () => {
    const RemoteApiProbe = () => {
      const api = useApi<{
        name: 'main';
        api: {
          getProducts: IServiceQuery<
            'getProducts',
            {},
            typeof remoteParamsSchema,
            { total: number }
          >;
        };
      }>(ReactMain);
      const [errorCode, setErrorCode] = useState('pending');

      useEffect(() => {
        void api
          .executeActorQuery({
            queryName: 'getProducts',
            params: {
              limit: 7,
            },
          })
          .then(result => {
            if (Either.isLeft(result)) {
              setErrorCode(result.left.code);
            }
          });
      }, [api]);

      return <output data-testid="remote-error">{errorCode}</output>;
    };

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
        >
          <RemoteApiProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="remote-error"]')?.textContent,
        ).toBe('mock-session-remote-api-unsupported');
      },
      { timeout: 10_000 },
    );
    expect(newHttpBatchRpcSessionMock).not.toHaveBeenCalled();
  });

  it('closes the database exactly once when fixture initialization fails after open', async () => {
    await act(async () => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
          resources={{
            user: [
              {
                actorId: 'actr_1',
                createdAt: fixtureDate,
                id: 'usr_duplicate',
                modelName: User.modelName,
                name: 'First duplicate',
                updatedAt: fixtureDate,
                version: User.version,
              },
              {
                actorId: 'actr_2',
                createdAt: fixtureDate,
                id: 'usr_duplicate',
                modelName: User.modelName,
                name: 'Second duplicate',
                updatedAt: fixtureDate,
                version: User.version,
              },
            ],
          }}
        >
          <div data-testid="must-not-render" />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(uncaughtErrors).toHaveLength(1);
      expect(sqliteCloseBoundary).toHaveBeenCalledTimes(1);
    });
    expect(
      container.querySelector('[data-testid="must-not-render"]'),
    ).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    didUnmount = true;
    expect(sqliteCloseBoundary).toHaveBeenCalledTimes(1);
  });

  it('closes exactly once when initialization finishes after unmount and never publishes children', async () => {
    let releaseInitialization = () => {};
    sqliteInitialization.wait = new Promise<void>(resolve => {
      releaseInitialization = resolve;
    });

    act(() => {
      root.render(
        <MockMainProvider
          userId="browser_user_1"
          accountId="acct_1"
          actorId="actr_1"
          generationId="gen_1"
          systemVersion="1.0.0"
          systemWorkerName="worker_1"
        >
          <div data-testid="late-child" />
        </MockMainProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(sqliteInitialization.entered).toHaveBeenCalledTimes(1);
    });
    expect(container.querySelector('[data-testid="late-child"]')).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    didUnmount = true;

    await act(async () => {
      releaseInitialization();
      await sqliteInitialization.wait;
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(sqliteCloseBoundary).toHaveBeenCalledTimes(1);
    });
    expect(container.querySelector('[data-testid="late-child"]')).toBeNull();
  });
});
