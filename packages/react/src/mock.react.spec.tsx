import { act, useEffect, useState } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  authenticationSignature,
  List,
  main,
  User,
} from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { primitives } from '@zerospin/schema';
import type * as Capnweb from 'capnweb';
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeZerospinApp } from './makeZerospinApp';
import { makeMockProvider } from './mock';
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

const sessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
    Layer.succeed(ZerospinApiUrl, 'https://api.example.test'),
  ),
);

const ZerospinMain = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {
    main: {
      controller: main,
    },
  },
  runtime: sessionRuntime,
});
const MockMainProvider = makeMockProvider({
  frontend: ZerospinMain.frontends.main,
  runtime: sessionRuntime,
});
const fixtureDate = new Date('2026-01-01T00:00:00.000Z');
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
  aggregateName: 'user',
  frontendName: 'main',
  systemName: 'mock-json-fixture-test',
});
const ZerospinJsonFixture = makeZerospinApp({
  systemName: 'mock-json-fixture-test',
  authentication: { signature: authenticationSignature },
  frontends: {
    main: {
      controller: jsonFrontend,
    },
  },
  runtime: sessionRuntime,
});
const MockJsonFixtureProvider = makeMockProvider({
  frontend: ZerospinJsonFixture.frontends.main,
  runtime: sessionRuntime,
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
      const session = useSession(ZerospinMain.frontends.main);
      const state = useInitializedStateOrThrow(ZerospinMain.frontends.main);
      const users = useLiveQuery(ZerospinMain.frontends.main, {
        query: db =>
          db.query.user.findMany({
            with: {
              lists: true,
            },
          }),
      });
      const items = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.item.findMany(),
      });
      const accounts = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.account.findMany(),
      });

      return (
        <output
          data-testid="ready"
          data-aggregate-id={state.aggregateId}
          data-user-id={state.userId}
          data-session-id={session.sessionId}
          data-session-status={state.sessionStatus}
          data-system-version={state.systemVersion}
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
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
          resources={{
            user: [
              {
                userId: 'user_1',
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
    expect(output?.getAttribute('data-aggregate-id')).toBe('acct_1');
    expect(output?.getAttribute('data-user-id')).toBe('user_1');
    expect(output?.getAttribute('data-session-id')).toMatch(/^sesn_/);
    expect(output?.getAttribute('data-session-status')).toBe('current');
    expect(output?.getAttribute('data-system-version')).toBe('1.0.0');
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

  it('provisions every model table as empty when resources are omitted', async () => {
    const EmptyModelsProbe = () => {
      const accounts = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.account.findMany(),
      });
      const items = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.item.findMany(),
      });
      const lists = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.list.findMany(),
      });
      const users = useLiveQuery(ZerospinMain.frontends.main, {
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
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
        >
          <EmptyModelsProbe />
        </MockMainProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(uncaughtErrors).toEqual([]);
        expect(
          container.querySelector('[data-testid="empty-models"]')?.textContent,
        ).toBe('{"accountCount":0,"itemCount":0,"listCount":0,"userCount":0}');
      },
      { timeout: 10_000 },
    );
  });

  it('encodes a decoded JSON fixture for the real Drizzle row', async () => {
    const JsonFixtureProbe = () => {
      const documents = useLiveQuery(ZerospinJsonFixture.frontends.main, {
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
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
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

    await vi.waitFor(
      () => {
        expect(uncaughtErrors).toEqual([]);
        expect(
          container.querySelector('[data-testid="json-fixture"]')?.textContent,
        ).toBe('{"label":"Decoded JSON fixture"}');
      },
      { timeout: 10_000 },
    );
  });

  it('executes one optimistic command, writes the command journal, and invalidates a live query without RPC or push', async () => {
    const listSnapshots: string[] = [];

    const StagingProbe = () => {
      const session = useSession(ZerospinMain.frontends.main);
      const lists = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.list.findMany(),
      });
      const [optimisticRowCount, setOptimisticRowCount] = useState(0);
      const [executeResult, setExecuteResult] = useState('pending');
      const [commandRowCount, setCommandRowCount] = useState(0);

      useEffect(() => {
        listSnapshots.push(lists.data.map(list => list.name).join(','));
      }, [lists.data]);

      useEffect(() => {
        const result = session.executeCommand({
          contractName: 'createList',
          payload: {
            id: 'lst_staged',
            name: 'Staged List',
            userId: 'usr_1',
          },
        });
        setExecuteResult(result._tag);
        const state = session.store.getState();
        if (state.isInitialized) {
          setOptimisticRowCount(
            state.db
              .select()
              .from(sessionOptimisticAppliedMutationDrizzleSchema)
              .all().length,
          );
          setCommandRowCount(
            state.db.select().from(sessionCommandJournalDrizzleSchema).all()
              .length,
          );
        }
      }, [session]);

      return (
        <output
          data-testid="staging"
          data-has-core-push={String('pushQueue' in session.coreSession)}
          data-optimistic-row-count={optimisticRowCount}
          data-execute-result={executeResult}
          data-command-row-count={commandRowCount}
        >
          {lists.data.map(list => list.name).join(',')}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
          resources={{
            user: [
              {
                userId: 'user_1',
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
        expect(output?.getAttribute('data-execute-result')).toBe('Success');
        expect(output?.getAttribute('data-optimistic-row-count')).toBe('1');
        expect(output?.getAttribute('data-command-row-count')).toBe('1');
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
      const state = useInitializedStateOrThrow(ZerospinMain.frontends.main);
      const users = useLiveQuery(ZerospinMain.frontends.main, {
        query: db => db.query.user.findMany(),
      });

      return (
        <output
          data-testid="identity"
          data-aggregate-id={state.aggregateId}
          data-user-id={state.userId}
          data-system-version={state.systemVersion}
        >
          {users.data.map(user => user.name).join(',')}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockMainProvider
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
          resources={{
            user: [
              {
                userId: 'user_1',
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
          userId="user_2"
          aggregateIds={{ user: 'acct_2' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_2' })}
          systemVersion="2.0.0"
          resources={{
            user: [
              {
                userId: 'user_2',
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
    expect(unchangedOutput?.getAttribute('data-aggregate-id')).toBe('acct_1');
    expect(unchangedOutput?.getAttribute('data-user-id')).toBe('user_1');
    expect(unchangedOutput?.getAttribute('data-system-version')).toBe('1.0.0');
    expect(unchangedOutput?.textContent).toContain('Original User');
    expect(unchangedOutput?.textContent).not.toContain('Replacement User');

    await act(async () => {
      root.render(
        <MockMainProvider
          key="reset"
          userId="user_2"
          aggregateIds={{ user: 'acct_2' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_2' })}
          systemVersion="2.0.0"
          resources={{
            user: [
              {
                userId: 'user_2',
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
        expect(resetOutput?.getAttribute('data-aggregate-id')).toBe('acct_2');
        expect(resetOutput?.getAttribute('data-user-id')).toBe('user_2');
        expect(resetOutput?.getAttribute('data-system-version')).toBe('2.0.0');
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

  it('closes the database exactly once when fixture initialization fails after open', async () => {
    await act(async () => {
      root.render(
        <MockMainProvider
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
          resources={{
            user: [
              {
                userId: 'user_1',
                createdAt: fixtureDate,
                id: 'usr_duplicate',
                modelName: User.modelName,
                name: 'First duplicate',
                updatedAt: fixtureDate,
                version: User.version,
              },
              {
                userId: 'user_2',
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
          userId="user_1"
          aggregateIds={{ user: 'acct_1' }}
          generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
          systemVersion="1.0.0"
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
