import {
  act,
  Component,
  createElement,
  StrictMode,
  type ReactNode,
} from 'react';

import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/makeModelVersion';
import type { InferResource } from '@zerospin/core/models/types';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import {
  makeAggregateFrontend,
  makeRuntime,
  makeStandaloneSession,
  stageCommand,
  useInitializeStandaloneSession,
} from '@zerospin/react';
import { BrowserBackup } from '@zerospin/react/BrowserBackup/BrowserBackup';
import { primitives } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cdp } from 'vitest/browser';

const User = makeModelVersion(
  defineModel({ name: 'user', abbreviation: 'usr' }),
  {
    version: '1.0.0',
    attributes: { name: primitives.text() },
    indexes: [],
  },
);
const List = makeModelVersion(
  defineModel({ name: 'list', abbreviation: 'lst' }),
  {
    version: '1.0.0',
    attributes: {
      name: primitives.text(),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'lists',
      }),
    },
    indexes: [],
  },
);
const createList = makeContractVersion(defineContract('createList'), {
  version: '1.0.0',
  payload: {
    id: primitives.foreignKey({ abbreviation: 'lst' }),
    name: primitives.text(),
    userId: primitives.foreignKey({ abbreviation: 'usr' }),
  },
  models: { list: List },
  program: ({ payload, models }) =>
    models.list.create({
      resourceId: payload.id,
      attributes: { name: payload.name, userId: payload.userId },
    }),
});
const main = makeAggregateFrontend({
  aggregateName: 'standalone',
  aggregateVersion: '1.0.0',
  name: 'standalone',
  authenticationSchema: Schema.Struct({
    userId: Schema.String,
    aggregateId: Schema.String,
  }),
  models: { user: User, list: List },
  contracts: { createList: { contract: createList } },
});

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const runtime = makeRuntime({ layer: Layer.empty });
const otherRuntime = makeRuntime({ layer: Layer.empty });
const sessions: { dispose(): Promise<void> }[] = [];
const resources: { user: InferResource<typeof User>[] } = {
  user: [
    {
      id: 'usr_1',
      modelName: User.modelName,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      version: User.version,
      name: 'Seed',
    },
  ],
};

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await runtime.dispose();
  await otherRuntime.dispose();
});

describe('standalone document lifecycle', () => {
  // 1. Commit locally behind an acknowledgement gate. 2. Reopen acknowledged history. 3. Reset to the original seed.
  it('separates local settlement from durable backup and restores history before constructor seeds', async () => {
    const session = makeStandaloneSession({
      key: crypto.randomUUID(),
      frontend: main,
      runtime,
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      resources,
    });
    sessions.push(session);
    const backup = await runtime.runPromise(BrowserBackup);
    const claim = backup.claim;
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let hold = false;
    vi.spyOn(backup, 'claim').mockImplementation(props =>
      claim(props).pipe(
        Effect.map(worker => {
          const acquireDb = worker.acquireDb;
          vi.spyOn(worker, 'acquireDb').mockImplementation(props =>
            acquireDb(props).pipe(
              Effect.map(acquisition => {
                const apply = acquisition.db.applyStatements;
                vi.spyOn(acquisition.db, 'applyStatements').mockImplementation(
                  props =>
                    Effect.gen(function* () {
                      if (hold) {
                        entered.resolve();
                        yield* Effect.promise(() => release.promise);
                      }
                      yield* apply(props);
                    }),
                );
                return acquisition;
              }),
            ),
          );
          return worker;
        }),
      ),
    );
    await session.initialize();
    const originalDb = session.store.getState().db;
    // 1 — Backup cannot acknowledge before the gate opens, but the command is already settled.
    hold = true;
    const command = await Effect.runPromise(
      decodeRpc(
        stageCommand({
          session,
          contractName: 'createList',
          payload: { id: 'lst_local', name: 'Local', userId: 'usr_1' },
        }),
      ),
    );
    await entered.promise;
    expect(session.store.getState().backupState.status).toBe('pending');
    expect(
      originalDb
        ?.select()
        .from(sessionOptimisticAppliedMutationDrizzleSchema)
        .all(),
    ).toEqual([]);
    expect(
      originalDb?.select().from(sessionCommandJournalDrizzleSchema).all(),
    ).toHaveLength(1);
    release.resolve();
    await expect
      .poll(() => session.store.getState().backupState.status)
      .toBe('ready');
    vi.restoreAllMocks();
    // 2 — Reopening restores the complete acknowledged occurrence.
    const oldId = session.sessionId;
    await session.dispose();
    await session.initialize();
    expect(session.sessionId).not.toBe(oldId);
    const rows = session.store
      .getState()
      .db?.select()
      .from(sessionCommandJournalDrizzleSchema)
      .all();
    expect(JSON.parse(rows?.[0]?.command ?? '{}')).toEqual({
      ...JSON.parse(JSON.stringify(command)),
      payload: JSON.stringify(command.payload),
    });
    expect(
      session.store
        .getState()
        .db?.select()
        .from(main.models.list.drizzleSchema)
        .all(),
    ).toEqual([expect.objectContaining({ id: 'lst_local', name: 'Local' })]);
    // 3 — Reset removes settled history and restores the constructor seed.
    await session.reset();
    expect(
      session.store
        .getState()
        .db?.select()
        .from(sessionCommandJournalDrizzleSchema)
        .all(),
    ).toEqual([]);
    expect(
      session.store
        .getState()
        .db?.select()
        .from(main.models.list.drizzleSchema)
        .all(),
    ).toEqual([]);
    expect(
      session.store.getState().db?.select().from(User.drizzleSchema).all(),
    ).toEqual([expect.objectContaining({ name: 'Seed' })]);
  });

  it('rejects different encoded authentication without overwriting the saved document', async () => {
    const key = crypto.randomUUID();
    const original = makeStandaloneSession({
      key,
      frontend: main,
      runtime,
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      resources,
    });
    const different = makeStandaloneSession({
      key,
      frontend: main,
      runtime,
      authentication: { userId: 'usr_other', aggregateId: 'acct_1' },
      resources: {},
    });
    sessions.push(original, different);
    await original.initialize();
    await original.dispose();
    await expect(different.initialize()).rejects.toThrow();
    await original.initialize();
    expect(
      original.store.getState().db?.select().from(User.drizzleSchema).all(),
    ).toEqual([expect.objectContaining({ name: 'Seed' })]);
    await original.dispose();
    await different.reset();
    expect(different.store.getState().authentication).toEqual({
      userId: 'usr_other',
      aggregateId: 'acct_1',
    });
    expect(
      different.store.getState().db?.select().from(User.drizzleSchema).all(),
    ).toEqual([]);
  });

  // 1. A second real connection takes ownership. 2. The first reacquires on focus without replacing its live handle.
  it('recovers revoked ownership on focus and retains its session and live database', async () => {
    const key = crypto.randomUUID();
    const first = makeStandaloneSession({
      key,
      frontend: main,
      runtime,
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      resources,
    });
    const second = makeStandaloneSession({
      key,
      frontend: main,
      runtime: otherRuntime,
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      resources: {},
    });
    sessions.push(first, second);
    await first.initialize();
    const db = first.store.getState().db;
    const id = first.sessionId;
    // 1 — Acquiring through a separate runtime revokes the first capability.
    await second.initialize();
    await expect
      .poll(() => first.store.getState().sessionStatus)
      .toBe('superseded');
    expect(
      stageCommand({
        session: first,
        contractName: 'createList',
        payload: { id: 'lst_revoked', name: 'No', userId: 'usr_1' },
      }),
    ).toMatchObject({ _tag: 'Failure' });
    await second.dispose();
    // 2 — Eligibility reacquires the saved baseline and renews execution identity in place.
    globalThis.dispatchEvent(new Event('focus'));
    await expect
      .poll(() => first.store.getState().sessionStatus)
      .toBe('current');
    expect(first.store.getState().db).toBe(db);
    expect(first.sessionId).not.toBe(id);
  });

  // 1. Fail an actual backup write. 2. Verify readable-but-closed state. 3. Explicitly reopen its last durable baseline.
  it('fails closed on terminal backup errors and recovers only through explicit reopen', async () => {
    const session = makeStandaloneSession({
      key: crypto.randomUUID(),
      frontend: main,
      runtime,
      authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
      resources,
    });
    sessions.push(session);
    const backup = await runtime.runPromise(BrowserBackup);
    const claim = backup.claim;
    vi.spyOn(backup, 'claim').mockImplementation(props =>
      claim(props).pipe(
        Effect.map(worker => {
          const acquire = worker.acquireDb;
          vi.spyOn(worker, 'acquireDb').mockImplementation(props =>
            acquire(props).pipe(
              Effect.map(acquisition => {
                vi.spyOn(acquisition.db, 'applyStatements').mockReturnValueOnce(
                  Effect.fail(
                    new ZerospinError({ code: 'test-backup-terminal' }),
                  ),
                );
                return acquisition;
              }),
            ),
          );
          return worker;
        }),
      ),
    );
    await session.initialize();
    // 1 — Local commit succeeds before the injected terminal write failure.
    expect(
      stageCommand({
        session,
        contractName: 'createList',
        payload: { id: 'lst_unbacked', name: 'Readable', userId: 'usr_1' },
      }),
    ).toMatchObject({ _tag: 'Success' });
    await expect
      .poll(() => session.store.getState().sessionStatus)
      .toBe('failed');
    // 2 — Readable data remains, but further staging and focus recovery are blocked.
    expect(
      session.store
        .getState()
        .db?.select()
        .from(main.models.list.drizzleSchema)
        .all(),
    ).toHaveLength(1);
    expect(
      stageCommand({
        session,
        contractName: 'createList',
        payload: { id: 'lst_blocked', name: 'Blocked', userId: 'usr_1' },
      }),
    ).toMatchObject({ _tag: 'Failure' });
    globalThis.dispatchEvent(new Event('focus'));
    expect(session.store.getState().sessionStatus).toBe('failed');
    // 3 — Explicit reopen restores only acknowledged state.
    await session.dispose();
    vi.restoreAllMocks();
    await session.initialize();
    expect(session.store.getState().sessionStatus).toBe('current');
    expect(
      session.store
        .getState()
        .db?.select()
        .from(main.models.list.drizzleSchema)
        .all(),
    ).toEqual([]);
  });
});

// 1. Revoke an acquisition before publication. 2. Resume from a fresh capability after the next visible signal.
it('never publishes an interrupted acquisition and resumes on pageshow', async () => {
  const session = makeStandaloneSession({
    key: crypto.randomUUID(),
    frontend: main,
    runtime,
    authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
    resources,
  });
  sessions.push(session);
  const backup = await runtime.runPromise(BrowserBackup);
  const claim = backup.claim;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('visible');
  vi.spyOn(backup, 'claim').mockImplementationOnce(props =>
    claim(props).pipe(
      Effect.map(worker => {
        const acquire = worker.acquireDb;
        vi.spyOn(worker, 'acquireDb').mockImplementationOnce(props =>
          acquire(props).pipe(
            Effect.flatMap(acquired =>
              Effect.gen(function* () {
                entered.resolve();
                yield* Effect.promise(() => release.promise);
                return acquired;
              }),
            ),
          ),
        );
        return worker;
      }),
    ),
  );
  const initializing = session.initialize();
  // 1 — Hide after the real grant exists but before it can be published.
  await entered.promise;
  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(session.store.getState().isInitialized).toBe(false);
  // 2 — A fresh visible signal must acquire again, not publish the obsolete grant.
  visibility.mockReturnValue('visible');
  globalThis.dispatchEvent(new Event('pageshow'));
  release.resolve();
  await initializing;
  expect(session.store.getState().sessionStatus).toBe('current');
});

// 1. Acknowledge a real write. 2. Terminate Chromium's worker. 3. Restore in the same mounted session.
it('reacquires after real worker termination without backend requests', async () => {
  const session = makeStandaloneSession({
    key: crypto.randomUUID(),
    frontend: main,
    runtime,
    authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
    resources,
  });
  sessions.push(session);
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const socketSpy = vi.spyOn(globalThis, 'WebSocket');
  await session.initialize();
  const db = session.store.getState().db;
  const oldId = session.sessionId;
  // 1 — Only acknowledged data is required to survive a killed worker.
  expect(
    stageCommand({
      session,
      contractName: 'createList',
      payload: { id: 'lst_restart', name: 'Restart', userId: 'usr_1' },
    }),
  ).toMatchObject({ _tag: 'Success' });
  await expect
    .poll(() => session.store.getState().backupState.status)
    .toBe('ready');
  // 2 — Terminate the actual SharedWorker target, not a simulated connection.
  const targets = await cdp().send('Target.getTargets');
  const worker = targets.targetInfos.find(
    target =>
      target.type === 'shared_worker' &&
      target.url.includes('/__zerospin/backup-worker.js'),
  );
  expect(worker).toBeDefined();
  if (worker === undefined) throw new Error('Missing real backup worker');
  expect(
    await cdp().send('Target.closeTarget', { targetId: worker.targetId }),
  ).toMatchObject({ success: true });
  // 3 — The existing session renews its identity and restores its original handle.
  await expect
    .poll(() => session.sessionId, { timeout: 30000 })
    .not.toBe(oldId);
  await expect
    .poll(() => session.store.getState().sessionStatus)
    .toBe('current');
  expect(session.store.getState().db).toBe(db);
  expect(db?.select().from(main.models.list.drizzleSchema).all()).toEqual([
    expect.objectContaining({ id: 'lst_restart' }),
  ]);
  expect(socketSpy).not.toHaveBeenCalled();
  expect(
    fetchSpy.mock.calls.filter(
      ([input]) =>
        !String(input).startsWith('data:') && !String(input).includes('.wasm'),
    ),
  ).toEqual([]);
});

it('owns React initialization through StrictMode and surfaces competing mounts without disposing the owner', async () => {
  const session = makeStandaloneSession({
    key: crypto.randomUUID(),
    frontend: main,
    runtime,
    authentication: { userId: 'usr_1', aggregateId: 'acct_1' },
    resources,
  });
  sessions.push(session);
  const firstContainer = document.createElement('div');
  const secondContainer = document.createElement('div');
  document.body.append(firstContainer, secondContainer);
  const firstRoot = createRoot(firstContainer);
  const secondRoot = createRoot(secondContainer, {
    onCaughtError: () => undefined,
  });
  try {
    await act(async () => {
      firstRoot.render(
        createElement(
          StrictMode,
          null,
          createElement(() => {
            const { isInitialized } = useInitializeStandaloneSession({
              session,
            });
            return createElement(
              'span',
              null,
              isInitialized ? 'ready' : 'starting',
            );
          }),
        ),
      );
    });
    await expect.poll(() => firstContainer.textContent).toBe('ready');
    const id = session.sessionId;
    if (id === null) throw new Error('Expected registered session');
    const entry = zerospinDevtoolsStore
      .getState()
      .aggregateSessionsById.get(id);
    expect(entry?.session).toBe(session);
    expect(entry).not.toHaveProperty('pushNow');
    await act(async () => {
      secondRoot.render(
        createElement(
          class extends Component<{ children?: ReactNode }> {
            override state: { error: unknown } = { error: null };
            static getDerivedStateFromError(error: unknown) {
              return { error };
            }
            override render() {
              return this.state.error === null
                ? this.props.children
                : createElement('span', null, 'ownership rejected');
            }
          },
          null,
          createElement(() => {
            useInitializeStandaloneSession({ session });
            return null;
          }),
        ),
      );
    });
    await expect
      .poll(() => secondContainer.textContent)
      .toBe('ownership rejected');
    expect(session.store.getState().sessionStatus).toBe('current');
    await act(async () => {
      secondRoot.unmount();
    });
    expect(session.store.getState().sessionStatus).toBe('current');
    await act(async () => {
      firstRoot.unmount();
    });
    await expect
      .poll(() => session.store.getState().sessionStatus)
      .toBe('released');
    expect(zerospinDevtoolsStore.getState().aggregateSessionsById.has(id)).toBe(
      false,
    );
  } finally {
    await act(async () => {
      firstRoot.unmount();
      secondRoot.unmount();
    });
    firstContainer.remove();
    secondContainer.remove();
  }
});
