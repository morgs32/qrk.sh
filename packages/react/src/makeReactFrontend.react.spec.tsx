import React, {
  act,
  createRef,
  StrictMode,
  useEffect,
  type RefObject,
} from 'react';

import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/core/models/primitives';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import type * as Capnweb from 'capnweb';
import { sql } from 'drizzle-orm';
import { Effect, ManagedRuntime, Schema } from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeReactFrontend,
  sessionProviderDefaultLayer,
} from './makeReactFrontend';
import { useLiveQuery } from './useLiveQuery';
import { useSession } from './useSession';
import { ZerospinConfig } from './ZerospinConfig';

const newHttpBatchRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

vi.mock('./acquireFrontendWebSocket', async () => {
  const { Effect } = await import('effect');
  return {
    acquireFrontendWebSocket: Effect.fn('acquireFrontendWebSocket')(
      function* () {
        yield* Effect.void;
        return Effect.void;
      },
    ),
  };
});

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const List = makeModel(
  {
    abbreviation: 'lst',
    modelName: 'list',
    attributes: {
      name: primitives.text(),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'lists',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Item = makeModel(
  {
    abbreviation: 'itm',
    modelName: 'item',
    attributes: {
      listId: primitives.ref({
        table: List.table,
        relation: 'list',
        inverse: 'items',
      }),
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const frontend = makeFrontendController({
  contracts: {},
  models: {
    item: Item,
    list: List,
    user: User,
  },
  accountName: 'user',
  actorName: 'reactSessionTestFrontend',
  frontendName: 'default',
  version: '1.0.0',
  systemName: 'reactSessionTestSystem',
  signature: Schema.Struct({}),
});

const ReactSession = makeReactFrontend({
  frontend,
});
const now = new Date('2026-01-01T00:00:00.000Z');

type IProviderRef = React.ComponentRef<typeof ReactSession.Provider>;

async function waitForSessionReady(props: {
  providerRef: RefObject<IProviderRef | null>;
}) {
  const { providerRef } = props;
  const session = providerRef.current?.session;
  expect(session).toBeDefined();

  if (session === undefined) {
    throw new Error('Session ref is not set');
  }

  await new Promise<void>(resolve => {
    session.onInitialized(() => {
      resolve();
    });
  });
  return session;
}

function SessionCapture(props: { onSession: (session: unknown) => void }) {
  const { onSession } = props;
  const session = useSession(ReactSession);

  useEffect(() => {
    onSession(session);
  }, [onSession, session]);

  return null;
}

function LiveQueryProbe(props: {
  onSnapshot: (snapshot: {
    data: unknown;
    error: Error | undefined;
    updatedAt: Date | undefined;
  }) => void;
  query: Parameters<typeof useLiveQuery<typeof frontend>>[1]['query'];
  deps?: readonly unknown[];
  tableNames?: readonly string[];
}) {
  const { deps = [], onSnapshot, query, tableNames = [] } = props;

  const result = useLiveQuery(ReactSession, {
    deps,
    query,
    tableNames,
  });

  useEffect(() => {
    onSnapshot({
      data: result.data,
      error: result.error,
      updatedAt: result.updatedAt,
    });
  }, [onSnapshot, result.data, result.error, result.updatedAt]);

  return null;
}

describe('makeReactFrontend.makeModelId', () => {
  it('returns id with model abbreviation prefix', () => {
    const id = ReactSession.makeModelId(User);
    expect(id).toMatch(/^usr_/);
  });
});

describe('makeReactFrontend.runtime', () => {
  it('uses a caller-provided session runtime', () => {
    const runtime = ManagedRuntime.make(sessionProviderDefaultLayer);

    const ReactSessionWithRuntime = makeReactFrontend({
      frontend,
      runtime,
    });

    expect(ReactSessionWithRuntime.sessionRuntime).toBe(runtime);
  });
});

describe('makeReactFrontend.Provider', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(mockFrontendApi.getFrontendState).mockImplementation(
      async _request => ({
        result: encodeRight({
          actorId: 'usr_1',
          accountName: frontend.accountName,
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          systemWorkerName: 'stub-deploy',
          frontendIndex: null,
          lastRebasedPushedCursor: null,
          pushedCommands: [],
          resources: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        }),
        link: null,
      }),
    );
    vi.mocked(mockFrontendApi.fetchActor).mockResolvedValue({
      result: encodeRight({
        actor: {
          accountId: 'acct_1',
          actorId: 'usr_1',
        },
        deployId: 'dpl_1',
        generationId: 'gen_1',
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'stub-deploy',
        systemEnvironmentId: 'dev',
      }),
      link: null,
    });
    getFrontendApi.mockImplementation(() => mockFrontendApi);
    newHttpBatchRpcSessionMock.mockReset();
    newHttpBatchRpcSessionMock.mockImplementation(() => ({
      getFrontendApi,
      [Symbol.dispose]: () => {
        /* Rpc session dispose (no-op in tests). */
      },
    }));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it('throws when the same ReactSession Provider mounts twice', async () => {
    const DuplicateReactSession = makeReactFrontend({
      frontend,
    });

    await expect(
      act(async () => {
        root.render(
          <ZerospinConfig userId="user_1">
            <>
              <DuplicateReactSession.Provider
                generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
              >
                <div />
              </DuplicateReactSession.Provider>
              <DuplicateReactSession.Provider
                generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
              >
                <div />
              </DuplicateReactSession.Provider>
            </>
          </ZerospinConfig>,
        );
        await Promise.resolve();
      }),
    ).rejects.toThrow(
      'The same ReactSession.Provider is already mounted on this page.',
    );
  });

  it('keeps the provider push queue open through StrictMode effect replay', async () => {
    const scheduledMicrotasks: Array<() => void> = [];
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, 'queueMicrotask')
      .mockImplementation(callback => {
        scheduledMicrotasks.push(callback);
      });
    const runtimeRunSync = vi.spyOn(ReactSession.sessionRuntime, 'runSync');

    await act(async () => {
      root.render(
        <StrictMode>
          <ZerospinConfig userId="user_strict_mode">
            <ReactSession.Provider
              generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
            >
              <div />
            </ReactSession.Provider>
          </ZerospinConfig>
        </StrictMode>,
      );
      await Promise.resolve();
    });

    await Promise.resolve();

    const strictModeCleanup = scheduledMicrotasks.at(-1);
    expect(strictModeCleanup).toBeDefined();
    const runSyncCallCount = runtimeRunSync.mock.calls.length;
    strictModeCleanup?.();
    expect(runtimeRunSync).toHaveBeenCalledTimes(runSyncCallCount);

    runtimeRunSync.mockRestore();
    queueMicrotaskSpy.mockRestore();
  });
});

describe('useLiveQuery', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(mockFrontendApi.getFrontendState).mockImplementation(
      async _request => ({
        result: encodeRight({
          actorId: 'usr_1',
          accountName: frontend.accountName,
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          systemWorkerName: 'stub-deploy',
          frontendIndex: null,
          lastRebasedPushedCursor: null,
          pushedCommands: [],
          resources: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        }),
        link: null,
      }),
    );
    vi.mocked(mockFrontendApi.fetchActor).mockResolvedValue({
      result: encodeRight({
        actor: {
          accountId: 'acct_1',
          actorId: 'usr_1',
        },
        deployId: 'dpl_1',
        generationId: 'gen_1',
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'stub-deploy',
        systemEnvironmentId: 'dev',
      }),
      link: null,
    });
    getFrontendApi.mockImplementation(() => mockFrontendApi);
    newHttpBatchRpcSessionMock.mockReset();
    newHttpBatchRpcSessionMock.mockImplementation(() => ({
      getFrontendApi,
      [Symbol.dispose]: () => {
        /* Rpc session dispose (no-op in tests). */
      },
    }));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it('invalidates for relations v2 root and nested tables, but ignores unrelated tables', async () => {
    let capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    capturedSession = await waitForSessionReady({ providerRef });

    const db = capturedSession.store.getState().db;

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db =>
                db.query.user.findMany({
                  with: {
                    lists: {
                      with: {
                        items: true,
                      },
                    },
                  },
                })
              }
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([]);

    await act(async () => {
      db.insert(frontend.models.user.drizzleSchema)
        .values({
          createdAt: now,
          id: 'usr_1',
          modelName: 'user',
          name: 'User 1',
          updatedAt: now,
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([
      expect.objectContaining({
        id: 'usr_1',
        lists: [],
        name: 'User 1',
      }),
    ]);

    await act(async () => {
      db.insert(frontend.models.list.drizzleSchema)
        .values({
          createdAt: now,
          id: 'lst_1',
          modelName: 'list',
          name: 'Inbox',
          updatedAt: now,
          userId: 'usr_1',
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
      await Promise.resolve();
    });

    const lastSnapshot288 = snapshots.at(-1);
    expect(lastSnapshot288?.data?.[0]?.lists).toEqual([
      expect.objectContaining({
        id: 'lst_1',
        items: [],
        name: 'Inbox',
      }),
    ]);

    await act(async () => {
      db.insert(frontend.models.item.drizzleSchema)
        .values({
          createdAt: now,
          id: 'itm_1',
          listId: 'lst_1',
          modelName: 'item',
          name: 'Write spec',
          updatedAt: now,
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
      await Promise.resolve();
    });

    const lastSnapshot312 = snapshots.at(-1);
    expect(lastSnapshot312?.data?.[0]?.lists?.[0]?.items).toEqual([
      expect.objectContaining({
        id: 'itm_1',
        name: 'Write spec',
      }),
    ]);

    const updatedAtBeforeUnrelatedWrite = snapshots.at(-1)?.updatedAt;

    await act(async () => {
      db.run(
        sql.raw(`
          CREATE TABLE IF NOT EXISTS debug_notes (
            id text PRIMARY KEY,
            body text NOT NULL
          )
        `),
      );
      db.run(
        sql.raw(`
          INSERT INTO debug_notes (id, body)
          VALUES ('dbg_1', 'ignore me')
        `),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.updatedAt).toBe(updatedAtBeforeUnrelatedWrite);
  });

  it('collects relation tables from a relation-only where filter', async () => {
    let capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    capturedSession = await waitForSessionReady({ providerRef });

    const db = capturedSession.store.getState().db;

    db.insert(frontend.models.user.drizzleSchema)
      .values({
        createdAt: now,
        id: 'usr_1',
        modelName: 'user',
        name: 'User 1',
        updatedAt: now,
        version: '1.0.0',
      })
      .run();

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db =>
                db.query.user.findMany({
                  where: {
                    lists: {
                      name: {
                        eq: 'Inbox',
                      },
                    },
                  },
                })
              }
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([]);

    await act(async () => {
      db.insert(frontend.models.list.drizzleSchema)
        .values({
          createdAt: now,
          id: 'lst_1',
          modelName: 'list',
          name: 'Inbox',
          updatedAt: now,
          userId: 'usr_1',
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([
      expect.objectContaining({
        id: 'usr_1',
      }),
    ]);
  });

  it('invalidates when a nested relation table changes', async () => {
    let capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    capturedSession = await waitForSessionReady({ providerRef });

    const db = capturedSession.store.getState().db;

    await act(async () => {
      db.insert(frontend.models.user.drizzleSchema)
        .values({
          createdAt: now,
          id: 'usr_relation_1',
          modelName: 'user',
          name: 'User 1',
          updatedAt: now,
          version: '1.0.0',
        })
        .run();
      db.insert(frontend.models.list.drizzleSchema)
        .values({
          createdAt: now,
          id: 'lst_relation_1',
          modelName: 'list',
          name: 'List 1',
          updatedAt: now,
          userId: 'usr_relation_1',
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
    });

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db =>
                db.query.user.findMany({
                  with: {
                    lists: {
                      with: {
                        items: true,
                      },
                    },
                  },
                })
              }
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([
      expect.objectContaining({
        id: 'usr_relation_1',
        lists: [
          expect.objectContaining({
            id: 'lst_relation_1',
            items: [],
          }),
        ],
      }),
    ]);

    await act(async () => {
      db.insert(frontend.models.item.drizzleSchema)
        .values({
          createdAt: now,
          id: 'itm_relation_1',
          listId: 'lst_relation_1',
          modelName: 'item',
          name: 'Item 1',
          updatedAt: now,
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([
      expect.objectContaining({
        id: 'usr_relation_1',
        lists: [
          expect.objectContaining({
            id: 'lst_relation_1',
            items: [
              expect.objectContaining({
                id: 'itm_relation_1',
              }),
            ],
          }),
        ],
      }),
    ]);
  });

  it('surfaces an error for raw queries without tableNames', async () => {
    let _capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    _capturedSession = await waitForSessionReady({ providerRef });

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db =>
                db
                  .select({ value: sql<number>`1` })
                  .from(sql`(select 1) as raw_source`)
              }
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.error?.message).toContain('explicit tableNames');
  });

  it('uses explicit tableNames for raw queries', async () => {
    let capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    capturedSession = await waitForSessionReady({ providerRef });

    const db = capturedSession.store.getState().db;

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db =>
                db
                  .select({ value: sql<number>`value` })
                  .from(sql`(select count(*) as value from user) as raw_source`)
              }
              tableNames={['user']}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.error).toBeUndefined();
    expect(snapshots.at(-1)?.data).toEqual([{ value: 0 }]);

    await act(async () => {
      db.insert(frontend.models.user.drizzleSchema)
        .values({
          createdAt: now,
          id: 'usr_2',
          modelName: 'user',
          name: 'User 2',
          updatedAt: now,
          version: '1.0.0',
        })
        .run();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.data).toEqual([{ value: 1 }]);
  });

  it('does not rerun when only the callback identity changes', async () => {
    let _capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    let buildCount = 0;
    const tableNames = ['user'];
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    _capturedSession = await waitForSessionReady({ providerRef });

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db => {
                buildCount += 1;
                return db
                  .select({ value: sql<number>`1` })
                  .from(sql`(select 1) as raw_source`);
              }}
              tableNames={tableNames}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(buildCount).toBe(1);
    expect(snapshots.at(-1)?.data).toEqual([{ value: 1 }]);

    const updatedAtAfterFirstRender = snapshots.at(-1)?.updatedAt;

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db => {
                buildCount += 1;
                return db
                  .select({ value: sql<number>`1` })
                  .from(sql`(select 1) as raw_source`);
              }}
              tableNames={tableNames}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(buildCount).toBe(1);
    expect(snapshots.at(-1)?.updatedAt).toBe(updatedAtAfterFirstRender);
  });

  it('reruns with the latest callback values when deps change', async () => {
    let _capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    let callCount = 0;
    let version = 1;
    const tableNames = ['user'];
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    _capturedSession = await waitForSessionReady({ providerRef });

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <LiveQueryProbe
              deps={[version]}
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db => {
                callCount += 1;
                return db
                  .select({ value: sql<number>`${version}` })
                  .from(sql`(select 1) as raw_source`);
              }}
              tableNames={tableNames}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(1);
    expect(snapshots.at(-1)?.data).toEqual([{ value: 1 }]);

    version = 2;

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <LiveQueryProbe
              deps={[version]}
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db => {
                callCount += 1;
                return db
                  .select({ value: sql<number>`${version}` })
                  .from(sql`(select 1) as raw_source`);
              }}
              tableNames={tableNames}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(2);
    expect(snapshots.at(-1)?.data).toEqual([{ value: 2 }]);
  });

  it('reruns with the latest prop-captured query when deps change', async () => {
    let _capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    let callCount = 0;
    let modelKey = 'cart';
    const tableNames = ['user'];
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    function ModelKeyLiveQueryProbe(props: {
      modelKey: string;
      onSnapshot: (snapshot: {
        data: unknown;
        error: Error | undefined;
        updatedAt: Date | undefined;
      }) => void;
    }) {
      const { modelKey: currentModelKey, onSnapshot } = props;

      return (
        <LiveQueryProbe
          deps={[currentModelKey]}
          onSnapshot={onSnapshot}
          query={db => {
            callCount += 1;
            return db
              .select({ modelKey: sql<string>`${currentModelKey}` })
              .from(sql`(select 1) as raw_source`);
          }}
          tableNames={tableNames}
        />
      );
    }

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    _capturedSession = await waitForSessionReady({ providerRef });

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <ModelKeyLiveQueryProbe
              modelKey={modelKey}
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(1);
    expect(snapshots.at(-1)?.data).toEqual([{ modelKey: 'cart' }]);

    modelKey = 'org';

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <ModelKeyLiveQueryProbe
              modelKey={modelKey}
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(2);
    expect(snapshots.at(-1)?.data).toEqual([{ modelKey: 'org' }]);
  });

  it('waits for db initialization before running the query', async () => {
    let _capturedSession: any = null;
    const providerRef = createRef<IProviderRef>();
    let callCount = 0;
    const snapshots: Array<{
      data: unknown;
      error: Error | undefined;
      updatedAt: Date | undefined;
    }> = [];

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            ref={providerRef}
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      await Effect.runPromise(Effect.void);
      await Promise.resolve();
    });

    _capturedSession = await waitForSessionReady({ providerRef });

    await act(async () => {
      root.render(
        <ZerospinConfig userId="user_1">
          <ReactSession.Provider
            generateSignature={() => Effect.succeed({ actorId: 'usr_1' })}
          >
            <SessionCapture
              onSession={session => {
                _capturedSession = session;
              }}
            />
            <LiveQueryProbe
              onSnapshot={snapshot => {
                snapshots.push(snapshot);
              }}
              query={db => {
                callCount += 1;
                return db
                  .select({ value: sql<number>`${callCount}` })
                  .from(sql`(select 1) as raw_source`);
              }}
              tableNames={['user']}
            />
          </ReactSession.Provider>
        </ZerospinConfig>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.error).toBeUndefined();

    await act(async () => {
      await Promise.resolve();
    });

    expect(callCount).toBe(1);
  });
});
