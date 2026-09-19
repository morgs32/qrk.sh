import { act, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { aggregateFrontendProps } from '@zerospin/core/fixtures/frontendProps';
import {
  List,
  main,
  User,
} from '@zerospin/core/fixtures/system';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/makeModelVersion';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { stageCommand } from '@zerospin/core/session/stageCommand';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import type { IAnyError } from '@zerospin/error';
import { CuidFactory, primitives } from '@zerospin/schema';
import type * as Capnweb from 'capnweb';
import { Effect, Layer, Redacted, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { assert, type Equals } from 'tsafe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeAggregateFrontend } from '../makeAggregateFrontend/makeAggregateFrontend';
import { makeRuntime } from '../makeRuntime/makeRuntime';
import { useInitializeMockSession } from '../useInitializeMockSession/useInitializeMockSession';
import { useLiveQuery } from '../useLiveQuery';
import { makeMockSession } from './makeMockSession';

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

const sessionRuntimeLayer = Layer.mergeAll(
  AsyncLive,
  NanoIdFactory,
  UlidMonotonicFactory,
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(ZerospinApiUrl, 'https://api.example.test'),
);

const runtime = makeRuntime({ layer: sessionRuntimeLayer });
const Main = makeAggregateFrontend(aggregateFrontendProps(main));
const fixtureDate = new Date('2026-01-01T00:00:00.000Z');
const JsonDocument = makeModelVersion(
  defineModel({ name: 'document', abbreviation: 'doc' }),
  {
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
);
const jsonClaims = Schema.Struct({
  aggregateId: Schema.String,
  userId: Schema.String,
  issuedAt: Schema.DateFromString,
});
const jsonFrontend = makeAggregateFrontend({
  authenticationSchema: jsonClaims,
  aggregateVersion: '1.0.0',
  contracts: {},
  models: {
    document: JsonDocument,
  },
  aggregateName: 'user',
  name: 'main',
});

function MockRoot(props: {
  session: {
    store: {
      subscribe: (listener: () => void) => () => void;
      getState: () => { isInitialized: boolean };
    };
    initialize: (props?: {
      generateSignature?: () => Effect.Effect<unknown, IAnyError>;
    }) => Promise<void>;
    dispose: () => Promise<void>;
  };
  children: ReactNode;
}) {
  const { session, children } = props;
  const { isInitialized } = useInitializeMockSession({ session });
  if (!isInitialized) {
    return null;
  }
  return children;
}

describe('makeMockSession', () => {
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

  it('releases local and application services when initialization fails before publication', async () => {
    const events: string[] = [];
    const frontend = makeAggregateFrontend({
      authenticationSchema: main.authentication.authenticationSchema,
      aggregateName: 'account',
      aggregateVersion: '1.0.0',
      name: 'web',
      models: {},
      contracts: {},
    });
    const failingRuntime = makeRuntime({
      layer: Layer.mergeAll(
        sessionRuntimeLayer,
        Layer.effect(
          CuidFactory,
          Effect.acquireRelease(
            Effect.succeed(() => Effect.succeed('application')),
            () =>
              Effect.sync(() => {
                events.push('release-app');
              }),
          ),
        ),
      ),
    });
    const session = makeMockSession({
      frontend,
      runtime: failingRuntime,
      layer: Layer.effect(
        CuidFactory,
        Effect.gen(function* () {
          const applicationId = yield* CuidFactory;
          events.push(yield* applicationId());
          return yield* Effect.acquireRelease(
            Effect.succeed(() => Effect.succeed('local')),
            () =>
              Effect.sync(() => {
                events.push('release-local');
              }),
          );
        }),
      ),
      // Intentionally invalid authentication to exercise runtime validation.
      authentication: { userId: 'user_1' } as never,
    });

    await expect(session.initialize()).rejects.toThrow(
      'Invalid mock authentication',
    );
    expect(events).toEqual(['application', 'release-local']);
    expect(sqliteInitialization.entered).not.toHaveBeenCalled();
    await failingRuntime.dispose();
  });

  it('gates children until real SQLite initialization and publishes typed seeded and empty models', async () => {
    const session = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
      resources: {
        user: [
          {
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
      },
    });

    const Probe = () => {
      const userId = session.makeId(User);
      const listId = session.makeId(List);
      assert<Equals<typeof userId, `usr_${string}`>>();
      assert<Equals<typeof listId, `lst_${string}`>>();
      expect(userId).toMatch(/^usr_.+/);
      expect(listId).toMatch(/^lst_.+/);
      expect(session.frontend.aggregateVersion).toBe(main.aggregateVersion);
      const state = useStore(session.store, s => s);
      expect(state.isInitialized).toBe(true);
      const users = useLiveQuery({
        session,
        query: db =>
          db.query.user.findMany({
            with: {
              lists: true,
            },
          }),
      });
      const items = useLiveQuery({
        session,
        query: db => db.query.item.findMany(),
      });
      const accounts = useLiveQuery({
        session,
        query: db => db.query.account.findMany(),
      });

      return (
        <output
          data-testid="ready"
          data-aggregate-id={state.aggregateId}
          data-user-id={
            state.isInitialized ? state.authentication.userId : null
          }
          data-session-id={session.sessionId}
          data-session-status={state.sessionStatus}
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
        <MockRoot session={session}>
          <Probe />
        </MockRoot>,
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
    const session = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
    });

    const EmptyModelsProbe = () => {
      const accounts = useLiveQuery({
        session,
        query: db => db.query.account.findMany(),
      });
      const items = useLiveQuery({
        session,
        query: db => db.query.item.findMany(),
      });
      const lists = useLiveQuery({
        session,
        query: db => db.query.list.findMany(),
      });
      const users = useLiveQuery({
        session,
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
        <MockRoot session={session}>
          <EmptyModelsProbe />
        </MockRoot>,
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
    const session = makeMockSession({
      frontend: jsonFrontend,
      runtime,
      authentication: {
        userId: 'user_1',
        aggregateId: 'acct_1',
        issuedAt: fixtureDate,
      },
      resources: {
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
      },
    });

    const JsonFixtureProbe = () => {
      const state = session.store.getState();
      if (state.isInitialized) {
        expect(state.authentication.issuedAt).toBeInstanceOf(Date);
        expect(state.authentication.issuedAt).toEqual(fixtureDate);
      }
      const documents = useLiveQuery({
        session,
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
        <MockRoot session={session}>
          <JsonFixtureProbe />
        </MockRoot>,
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

  it('stages one optimistic command, writes the command journal, and invalidates a live query without RPC or push', async () => {
    const listSnapshots: string[] = [];
    const session = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
      resources: {
        user: [
          {
            createdAt: fixtureDate,
            id: 'usr_1',
            modelName: User.modelName,
            name: 'User 1',
            updatedAt: fixtureDate,
            version: User.version,
          },
        ],
      },
    });

    const StagingProbe = () => {
      const lists = useLiveQuery({
        session,
        query: db => db.query.list.findMany(),
      });
      const [optimisticRowCount, setOptimisticRowCount] = useState(0);
      const [stageResult, setStageResult] = useState('pending');
      const [commandRowCount, setCommandRowCount] = useState(0);

      useEffect(() => {
        listSnapshots.push(lists.data.map(list => list.name).join(','));
      }, [lists.data]);

      useEffect(() => {
        const result = stageCommand({
          session,
          contractName: 'createList',
          payload: {
            id: 'lst_staged',
            name: 'Staged List',
            userId: 'usr_1',
          },
        });
        setStageResult(result._tag);
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
      }, []);

      return (
        <output
          data-testid="staging"
          data-optimistic-row-count={optimisticRowCount}
          data-stage-result={stageResult}
          data-command-row-count={commandRowCount}
        >
          {lists.data.map(list => list.name).join(',')}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockRoot session={session}>
          <StagingProbe />
        </MockRoot>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        const output = container.querySelector('[data-testid="staging"]');
        expect(output?.getAttribute('data-stage-result')).toBe('Success');
        expect(output?.getAttribute('data-optimistic-row-count')).toBe('1');
        expect(output?.getAttribute('data-command-row-count')).toBe('1');
        expect(output?.textContent).toContain('Staged List');
      },
      { timeout: 10_000 },
    );

    expect(listSnapshots).toContain('');
    expect(listSnapshots.at(-1)).toBe('Staged List');
    expect(newHttpBatchRpcSessionMock).not.toHaveBeenCalled();
  });

  it('captures fixture identity at construction; a new session is the reset boundary', async () => {
    const first = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
      resources: {
        user: [
          {
            createdAt: fixtureDate,
            id: 'usr_1',
            modelName: User.modelName,
            name: 'Original User',
            updatedAt: fixtureDate,
            version: User.version,
          },
        ],
      },
    });

    const IdentityProbe = (props: { session: typeof first }) => {
      const { session } = props;
      const state = useStore(session.store, s => s);
      const users = useLiveQuery({
        session,
        query: db => db.query.user.findMany(),
      });

      return (
        <output
          data-testid="identity"
          data-aggregate-id={state.isInitialized ? state.aggregateId : null}
          data-user-id={
            state.isInitialized ? state.authentication.userId : null
          }
        >
          {users.data.map(user => user.name).join(',')}
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockRoot session={first}>
          <IdentityProbe session={first} />
        </MockRoot>,
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

    const second = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_2', aggregateId: 'acct_2' },
      resources: {
        user: [
          {
            createdAt: fixtureDate,
            id: 'usr_2',
            modelName: User.modelName,
            name: 'Replacement User',
            updatedAt: fixtureDate,
            version: User.version,
          },
        ],
      },
    });

    await act(async () => {
      root.render(
        <MockRoot session={second}>
          <IdentityProbe session={second} />
        </MockRoot>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        const resetOutput = container.querySelector('[data-testid="identity"]');
        expect(resetOutput?.getAttribute('data-aggregate-id')).toBe('acct_2');
        expect(resetOutput?.getAttribute('data-user-id')).toBe('user_2');
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
    const session = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
      resources: {
        user: [
          {
            createdAt: fixtureDate,
            id: 'usr_duplicate',
            modelName: User.modelName,
            name: 'First duplicate',
            updatedAt: fixtureDate,
            version: User.version,
          },
          {
            createdAt: fixtureDate,
            id: 'usr_duplicate',
            modelName: User.modelName,
            name: 'Second duplicate',
            updatedAt: fixtureDate,
            version: User.version,
          },
        ],
      },
    });

    await act(async () => {
      root.render(
        <MockRoot session={session}>
          <div data-testid="must-not-render" />
        </MockRoot>,
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

    const session = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
    });

    act(() => {
      root.render(
        <MockRoot session={session}>
          <div data-testid="late-child" />
        </MockRoot>,
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

  it('completes init with a nested children tree without RangeError or hash failures', async () => {
    const session = makeMockSession({
      frontend: Main,
      runtime,
      authentication: { userId: 'user_1', aggregateId: 'acct_1' },
    });

    const NestedProbe = () => {
      const state = useStore(session.store, s => s);
      return (
        <output
          data-testid="nested-ready"
          data-aggregate-id={state.isInitialized ? state.aggregateId : null}
        >
          nested-ready
        </output>
      );
    };

    await act(async () => {
      root.render(
        <MockRoot session={session}>
          <div>
            <section>
              <article>
                <header>
                  <h1>Nested mock children</h1>
                </header>
                <p>Regression for hashing React children during mock init.</p>
                <ul>
                  {Array.from({ length: 24 }, (_, index) => (
                    <li key={index}>
                      <span>Item {index}</span>
                      <button type="button" onClick={() => undefined}>
                        Action {index}
                      </button>
                    </li>
                  ))}
                </ul>
                <NestedProbe />
              </article>
            </section>
          </div>
        </MockRoot>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(uncaughtErrors).toEqual([]);
        const output = container.querySelector('[data-testid="nested-ready"]');
        expect(output?.getAttribute('data-aggregate-id')).toBe('acct_1');
        expect(output?.textContent).toBe('nested-ready');
      },
      { timeout: 10_000 },
    );
    expect(
      uncaughtErrors.some(
        error => error instanceof RangeError || String(error).includes('hash'),
      ),
    ).toBe(false);
  });
});
