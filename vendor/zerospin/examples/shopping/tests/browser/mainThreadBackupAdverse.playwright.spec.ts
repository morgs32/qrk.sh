/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, useEffect } from 'react';

import type {} from '@vitest/browser-playwright';
import { acquireBackupWorker } from '@zerospin/backup-worker';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import { makeZerospinApp } from '@zerospin/react/makeZerospinApp';
import type { IBrowserSession } from '@zerospin/react/types';
import { useSession } from '@zerospin/react/useSession';
import { newWebSocketRpcSession } from 'capnweb';
import { eq, sql } from 'drizzle-orm';
import {
  Effect,
  Layer,
  ManagedRuntime,
  Redacted,
  Result,
  Schema,
} from 'effect';
import { createRoot } from 'react-dom/client';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { commands } from 'vitest/browser';

import type { runFrontendLifecycleAcceptance } from '../../vitest.playwright.config';

import {
  ClerkUserIdSchema,
  userV1,
} from '@/zerospin/aggregates/shopper/models/user/userV1';
import { signature } from '@/zerospin/signature';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

declare module 'vitest/browser' {
  interface BrowserCommands {
    startAdverseFixture(): Promise<void>;
    stopAdverseFixture(): Promise<void>;
    runFrontendLifecycleAcceptance(
      scenario: 'canceled' | 'independent' | 'frozen',
      run: string,
    ): ReturnType<typeof runFrontendLifecycleAcceptance>;
  }
}

const WebV2 = ZerospinApp.frontends.web.frontend;

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

const adverseRuntimeLayer = Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('mainThreadBackupAdverse'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApiUrl, 'http://127.0.0.1:3035/'),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  ),
  adverseRuntime = ManagedRuntime.make(adverseRuntimeLayer);

const AdverseZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: {
    version: signature.version,
    signature: signature.signature,
  },
  frontends: {
    web: WebV2,
  },
  layer: adverseRuntimeLayer,
});

function AdverseSessionProbe(props: {
  onSession(
    session: IBrowserSession<typeof AdverseZerospinApp.frontends.web.frontend>,
  ): void;
}) {
  const session = useSession(AdverseZerospinApp.frontends.web);
  const { onSession } = props;

  useEffect(() => {
    onSession(session);
  }, [onSession, session]);

  return null;
}

beforeEach(() => {
  // Each top-level case authenticates a different test user. Keep restoration
  // within a case intact while removing only this application's saved locator.
  localStorage.removeItem(
    `zerospin:authentication:${JSON.stringify({
      apiUrl: 'http://127.0.0.1:3035/',
      publishableKey: 'pk_test',
      systemName: 'shopping',
      authenticationLock: makeAuthenticationLock(signature),
    })}`,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await adverseRuntime.dispose();
});

describe('main-thread IndexedDB adverse acceptance', () => {
  it('never publishes hidden or canceled aggregate/service grants and coalesces visible restoration', async () => {
    const result = await commands.runFrontendLifecycleAcceptance(
      'canceled',
      `${testRunId}-canceled`,
    );
    if (
      result.hidden === undefined ||
      result.resumed === undefined ||
      result.repeated === undefined
    ) {
      throw new Error('Expected canceled-acquisition observations');
    }
    expect(result.hidden.acquisitions).toBe(0);
    expect(result.hidden.publications).toEqual([]);
    expect(result.resumed.heldGrants).toBe(2);
    expect(result.resumed.acquisitions).toBeGreaterThan(2);
    expect(
      result.resumed.publications.some(
        publication => publication.acquisitions === 2,
      ),
    ).toBe(false);
    expect(result.resumed.aggregate.status).toBe('current');
    expect(result.resumed.service.status).toBe('current');
    expect(result.repeated.aggregate).toEqual(result.resumed.aggregate);
    expect(result.repeated.service).toEqual(result.resumed.service);
    expect(result.repeated.aggregate.sameDb).toBe(true);
    expect(result.repeated.service.sameDb).toBe(true);
  }, 300_000);

  it('revokes aggregate and service ownership independently and renews both in their original live databases', async () => {
    const result = await commands.runFrontendLifecycleAcceptance(
      'independent',
      `${testRunId}-independent`,
    );
    if (
      result.initial === undefined ||
      result.afterAggregate === undefined ||
      result.afterService === undefined ||
      result.renewed === undefined
    ) {
      throw new Error('Expected independent-ownership observations');
    }
    expect(result.afterAggregate.aggregate.status).toBe('superseded');
    expect(result.afterAggregate.service).toEqual(result.initial.service);
    expect(result.afterService.aggregate.status).toBe('current');
    expect(result.renewed.aggregate.status).toBe('current');
    expect(result.renewed.service.status).toBe('current');
    expect(result.renewed.aggregate.sameDb).toBe(true);
    expect(result.renewed.service.sameDb).toBe(true);
    expect(result.renewed.aggregate.id).not.toBe(result.initial.aggregate.id);
    expect(result.renewed.service.id).not.toBe(result.initial.service.id);
  }, 300_000);

  it('takes over offline from a frozen owner while excluding its undelivered authored command and resources', async () => {
    const result = await commands.runFrontendLifecycleAcceptance(
      'frozen',
      `${testRunId}-frozen`,
    );
    expect(result).toMatchObject({
      previousHadUser: true,
      previousHadCommand: true,
      successorHadUser: false,
      successorHadCommand: false,
      staleOverwrite: 'backup-db-revoked',
      successorStillHasUser: false,
      successor: {
        aggregate: { status: 'current' },
        service: { status: 'current' },
      },
    });
  }, 300_000);

  it('round-trips committed snapshots, rolls back batches, and permanently revokes old capabilities', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backupKey = `/zerospin/storage-${testRunId}/user/service/catalog/web/${'a'.repeat(64)}/backup.sqlite3`;
          const firstWorker = yield* acquireBackupWorker();
          const secondWorker = yield* acquireBackupWorker();
          let revoked = false;
          const first = yield* firstWorker.acquireDb({
            backupKey,
            onRevoked: () => {
              revoked = true;
            },
          });
          expect(first.status).toBe('acquired');
          if (first.status !== 'acquired') {
            throw new Error('Expected a new grant');
          }
          expect(first.snapshot).toBeNull();
          const dbConfig = makeResourceDbConfig({
            models: {},
            otherTables: {},
          });
          const source = yield* makeProvisionedInMemoryWasmSqliteDb({
            dbConfig,
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              source.$client.sqlite3.close(source.$client.db);
            }),
          );
          source.run(
            sql.raw(
              'CREATE TABLE backup_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
            ),
          );
          source.run(sql.raw("INSERT INTO backup_test VALUES (1, 'baseline')"));
          const baseline = source.$client.sqlite3.serialize(
            source.$client.db,
            'main',
          );
          yield* first.db.overwriteDb({ snapshot: baseline });
          const current = yield* firstWorker.acquireDb({
            backupKey,
            onRevoked: () => {
              revoked = true;
            },
          });
          expect(current.status).toBe('current');
          const second = yield* secondWorker.acquireDb({
            backupKey,
            onRevoked: () => {},
          });
          if (second.status !== 'acquired' || second.snapshot === null) {
            throw new Error('Expected committed takeover snapshot');
          }
          yield* Effect.promise(() => expect.poll(() => revoked).toBe(true));
          expect(
            yield* first.db
              .applyStatements({
                statements: [
                  { sql: 'DELETE FROM backup_test', parameters: [] },
                ],
              })
              .pipe(Effect.result),
          ).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'backup-db-revoked' },
          });
          expect(
            yield* current.db
              .overwriteDb({ snapshot: baseline })
              .pipe(Effect.result),
          ).toMatchObject({
            _tag: 'Failure',
            failure: { code: 'backup-db-revoked' },
          });
          yield* first.db.dispose().pipe(Effect.ignore);
          const failed = yield* second.db
            .applyStatements({
              statements: [
                {
                  sql: 'INSERT INTO backup_test VALUES (?, ?)',
                  parameters: [2, 'must-roll-back'],
                },
                {
                  sql: 'INSERT INTO backup_test VALUES (?, ?)',
                  parameters: [1, 'duplicate'],
                },
              ],
            })
            .pipe(Effect.result);
          expect(Result.isFailure(failed)).toBe(true);
          const rolledBack = yield* second.db.exportSnapshot();
          if (rolledBack === null) {
            throw new Error('Expected committed snapshot');
          }
          expect(
            source.$client.sqlite3.deserialize(
              source.$client.db,
              'main',
              rolledBack,
              rolledBack.byteLength,
              rolledBack.byteLength,
              1,
            ),
          ).toBe(0);
          expect(source.all(sql.raw('SELECT * FROM backup_test'))).toEqual([
            { id: 1, value: 'baseline' },
          ]);
          yield* second.db.applyStatements({
            statements: [
              {
                sql: 'INSERT INTO backup_test VALUES (?, ?)',
                parameters: [2, 'second'],
              },
              {
                sql: 'UPDATE backup_test SET value = ? WHERE id = ?',
                parameters: ['updated', 2],
              },
            ],
          });
          const committed = yield* second.db.exportSnapshot();
          if (committed === null) {
            throw new Error('Expected committed snapshot');
          }
          expect(
            source.$client.sqlite3.deserialize(
              source.$client.db,
              'main',
              committed,
              committed.byteLength,
              committed.byteLength,
              1,
            ),
          ).toBe(0);
          expect(
            source.all(sql.raw('SELECT * FROM backup_test ORDER BY id')),
          ).toEqual([
            { id: 1, value: 'baseline' },
            { id: 2, value: 'updated' },
          ]);
          // Invalid replacements leave the last complete committed database usable.
          expect(
            Result.isFailure(
              yield* second.db
                .overwriteDb({ snapshot: new Uint8Array([1, 2, 3]) })
                .pipe(Effect.result),
            ),
          ).toBe(true);
          const afterInvalid = yield* second.db.exportSnapshot();
          expect(afterInvalid).toEqual(committed);
          yield* second.db.overwriteDb({ snapshot: baseline });
          const reset = yield* second.db.exportSnapshot();
          if (reset === null) throw new Error('Expected committed snapshot');
          expect(
            source.$client.sqlite3.deserialize(
              source.$client.db,
              'main',
              reset,
              reset.byteLength,
              reset.byteLength,
              1,
            ),
          ).toBe(0);
          expect(source.all(sql.raw('SELECT * FROM backup_test'))).toEqual([
            { id: 1, value: 'baseline' },
          ]);
          yield* second.db.dispose();
          const reopened = yield* firstWorker.acquireDb({
            backupKey,
            onRevoked: () => {},
          });
          if (reopened.status !== 'acquired' || reopened.snapshot === null) {
            throw new Error('Disposal must preserve the backup');
          }
          expect(reopened.snapshot).toEqual(reset);
          const { cdp } = yield* Effect.promise(() => import('vitest/browser'));
          const targets = yield* Effect.promise(() =>
            cdp().send('Target.getTargets'),
          );
          expect(
            targets.targetInfos.filter(
              target =>
                target.type === 'shared_worker' &&
                target.url.endsWith('/__zerospin/backup-worker.js'),
            ),
          ).toHaveLength(1);
          expect(
            targets.targetInfos.filter(
              target => target.type === 'worker' && /backup/i.test(target.url),
            ),
          ).toHaveLength(0);
          const storage = yield* Effect.promise(() => indexedDB.databases());
          expect(
            storage.some(db => db.name === 'zerospin-backups-idb-v1'),
          ).toBe(true);
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  }, 120_000);

  it('pauses a superseded frontend and renews it on focus without remounting or rewriting command occurrences', async () => {
    const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(
      `adverse-handoff-${testRunId}`,
    );
    const firstContainer = document.createElement('div');
    const secondContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    document.body.appendChild(secondContainer);
    const firstRoot = createRoot(firstContainer);
    const secondRoot = createRoot(secondContainer);
    let secondMounted = true;
    let firstMounts = 0;
    const captures: {
      first: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
      second: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
    } = { first: null, second: null };
    try {
      await act(async () => {
        firstRoot.render(
          createElement(AdverseZerospinApp.Provider, {
            aggregateIds: { shopperFrontend: 'acct_1' },
            generateSignature: () => Effect.succeed({ clerkUserId }),
            children: createElement(AdverseSessionProbe, {
              onSession: session => {
                captures.first = session;
                firstMounts++;
              },
            }),
          }),
        );
      });
      await expect
        .poll(() => captures.first?.store.getState().backupState.status, {
          timeout: 120_000,
        })
        .toBe('ready');
      const first = captures.first;
      if (first === null) throw new Error('Expected first frontend');
      const firstId = first.sessionId;
      const firstState = first.store.getState();
      if (!firstState.isInitialized) {
        throw new Error('Expected initialized first frontend');
      }
      const liveDb = firstState.db;
      const registration = zerospinDevtoolsStore
        .getState()
        .aggregateSessionsById.get(firstId);
      if (registration === undefined) {
        throw new Error('Expected DevTools controls');
      }
      await registration.setPushPaused({ pushPaused: true });
      const created = await first.executeCommand({
        contractName: 'createUser',
        payload: { id: userV1.prefixId(clerkUserId), clerkUserId },
      });
      if (created._tag === 'Failure') throw new Error(created.failure.message);
      await expect
        .poll(() => first.store.getState().backupState.status, {
          timeout: 30_000,
        })
        .toBe('ready');
      const journalBefore = JSON.stringify(
        liveDb
          .select()
          .from(sessionCommandJournalDrizzleSchema)
          .where(eq(sessionCommandJournalDrizzleSchema.id, created.success.id))
          .get(),
      );
      globalThis.dispatchEvent(new Event('focus'));
      globalThis.dispatchEvent(new Event('pageshow'));
      await expect
        .poll(() => first.store.getState().backupState.status)
        .toBe('ready');
      expect(first.sessionId).toBe(firstId);
      expect(first.store.getState().db).toBe(liveDb);
      await act(async () => {
        secondRoot.render(
          createElement(AdverseZerospinApp.Provider, {
            aggregateIds: { shopperFrontend: 'acct_1' },
            generateSignature: () => Effect.succeed({ clerkUserId }),
            children: createElement(AdverseSessionProbe, {
              onSession: session => {
                captures.second = session;
              },
            }),
          }),
        );
      });
      await expect
        .poll(() => captures.second?.store.getState().backupState.status, {
          timeout: 120_000,
        })
        .toBe('ready');
      await expect
        .poll(() => first.store.getState().sessionStatus)
        .toBe('superseded');
      expect(
        await first.executeCommand({
          contractName: 'createUser',
          payload: { id: userV1.prefixId(clerkUserId), clerkUserId },
        }),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-frontend-session-not-current' },
      });
      expect(await registration.pushNow()).toMatchObject({ _tag: 'Failure' });
      const second = captures.second;
      if (second === null) throw new Error('Expected successor frontend');
      const secondState = second.store.getState();
      if (!secondState.isInitialized) {
        throw new Error('Expected initialized successor');
      }
      const restored = secondState.db
        .select()
        .from(sessionCommandJournalDrizzleSchema)
        .where(eq(sessionCommandJournalDrizzleSchema.id, created.success.id))
        .get();
      // A server acknowledgement may advance pushIndex, but occurrence bytes stay unchanged.
      expect(restored?.sessionId).toBe(firstId);
      expect(restored?.sessionIndex).toBe(created.success.sessionIndex);
      const prior = JSON.parse(journalBefore);
      expect(restored?.command).toEqual(prior.command);
      await act(async () => {
        secondRoot.unmount();
      });
      secondMounted = false;
      globalThis.dispatchEvent(new Event('focus'));
      await expect
        .poll(
          () => ({
            status: first.store.getState().sessionStatus,
            renewed: first.sessionId !== firstId,
            backup: first.store.getState().backupState.status,
          }),
          { timeout: 60_000 },
        )
        .toEqual({ status: 'current', renewed: true, backup: 'ready' });
      expect(captures.first).toBe(first);
      expect(first.store.getState().db).toBe(liveDb);
      expect(firstMounts).toBe(1);
      expect(
        zerospinDevtoolsStore.getState().aggregateSessionsById.has(firstId),
      ).toBe(false);
      expect(
        zerospinDevtoolsStore
          .getState()
          .aggregateSessionsById.has(first.sessionId),
      ).toBe(true);
      const renewedId = first.sessionId;
      globalThis.dispatchEvent(new Event('focus'));
      globalThis.dispatchEvent(new Event('pageshow'));
      expect(first.sessionId).toBe(renewedId);
    } finally {
      await act(async () => {
        if (secondMounted) secondRoot.unmount();
        firstRoot.unmount();
      });
      firstContainer.remove();
      secondContainer.remove();
    }
  }, 300_000);

  it('publishes no session when page authentication fails', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using systemApi = await gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test',
            });
            await Effect.runPromise(
              decodeRpc(
                (await systemApi.healthcheck({ args: [], traceContext: null }))
                  .result,
              ),
            );
            return true;
          } catch {
            return false;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(true);
    const aggregateSessionCountBefore =
      zerospinDevtoolsStore.getState().aggregateSessionsById.size;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bootstrapFailure = Promise.withResolvers<unknown>();
    const root = createRoot(container, {
      onUncaughtError: error => {
        bootstrapFailure.resolve(error);
      },
    });
    let publicSession: IBrowserSession<
      typeof AdverseZerospinApp.frontends.web.frontend
    > | null = null;
    let signatureCallCount = 0;

    try {
      await act(async () => {
        root.render(
          createElement(AdverseZerospinApp.Provider, {
            aggregateIds: { shopperFrontend: 'acct_1' },
            generateSignature: () => {
              signatureCallCount += 1;
              return Effect.fail(
                new ZerospinError({
                  code: 'adverse-worker-signature-failed',
                  message: 'The page refused the worker authentication attempt',
                }),
              );
            },
            children: createElement(AdverseSessionProbe, {
              onSession: session => {
                publicSession = session;
              },
            }),
          }),
        );
        await Promise.resolve();
      });

      expect(
        ZerospinError.prettyUnknownFailure(await bootstrapFailure.promise),
      ).toContain('adverse-worker-signature-failed');
      expect(signatureCallCount).toBe(1);
      expect(publicSession).toBeNull();
      expect(container.textContent).toBe('');
      expect(zerospinDevtoolsStore.getState().aggregateSessionsById.size).toBe(
        aggregateSessionCountBefore,
      );
    } finally {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
    }
  });

  it('hydrates cached state while the port is offline and promotes the port online', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using systemApi = await gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test',
            });
            await Effect.runPromise(
              decodeRpc(
                (await systemApi.healthcheck({ args: [], traceContext: null }))
                  .result,
              ),
            );
            return true;
          } catch {
            return false;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(true);
    const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(
      `adverse-offline-user-${testRunId}`,
    );
    const firstContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);
    const firstSessionCapture: {
      current: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
    } = { current: null };

    await act(async () => {
      firstRoot.render(
        createElement(AdverseZerospinApp.Provider, {
          aggregateIds: { shopperFrontend: 'acct_1' },
          generateSignature: () => Effect.succeed({ clerkUserId }),
          children: createElement(AdverseSessionProbe, {
            onSession: session => {
              firstSessionCapture.current = session;
            },
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          firstSessionCapture.current?.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const firstSession = firstSessionCapture.current;
    if (firstSession === null) {
      throw new Error('The online session must initialize');
    }

    const createdUser = await firstSession.executeCommand({
      contractName: 'createUser',
      payload: {
        id: userV1.prefixId(clerkUserId),
        clerkUserId,
      },
    });
    if (createdUser._tag === 'Failure') {
      throw new Error(createdUser.failure.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return (
            state.db
              .select({
                sessionIndex: sessionCommandJournalDrizzleSchema.sessionIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(
                eq(
                  sessionCommandJournalDrizzleSchema.id,
                  createdUser.success.id,
                ),
              )
              .get()?.sessionIndex ?? 0
          );
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    const retainedName = `Retained offline ${testRunId}`;
    const updatedUser = await firstSession.executeCommand({
      contractName: 'updateUser',
      payload: {
        id: userV1.prefixId(clerkUserId),
        name: retainedName,
      },
    });
    if (updatedUser._tag === 'Failure') {
      throw new Error(updatedUser.failure.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return (
            state.db
              .select({
                sessionIndex: sessionCommandJournalDrizzleSchema.sessionIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(
                eq(
                  sessionCommandJournalDrizzleSchema.id,
                  updatedUser.success.id,
                ),
              )
              .get()?.sessionIndex ?? 0
          );
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    const firstState = firstSession.store.getState();
    if (!firstState.isInitialized) {
      throw new Error('The online session must initialize');
    }
    await expect
      .poll(() => firstSession.store.getState().backupState.status, {
        interval: 100,
        timeout: 120_000,
      })
      .toBe('ready');
    const retainedUserIndex = firstSession.store.getState().userIndex;

    await act(async () => {
      firstRoot.unmount();
      await Promise.resolve();
    });
    firstContainer.remove();

    const { cdp } = await import('vitest/browser');
    const targets = await cdp().send('Target.getTargets');
    const backupWorkerTarget = targets.targetInfos.find(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('/__zerospin/backup-worker.js'),
    );
    if (backupWorkerTarget === undefined) {
      throw new Error(
        'Chromium must expose the seeded IndexedDB backup SharedWorker',
      );
    }
    const closedTarget = await cdp().send('Target.closeTarget', {
      targetId: backupWorkerTarget.targetId,
    });
    expect(closedTarget.success).toBe(true);
    await expect
      .poll(
        async () => {
          const remainingTargets = await cdp().send('Target.getTargets');
          return remainingTargets.targetInfos.some(
            target => target.targetId === backupWorkerTarget.targetId,
          );
        },
        { interval: 100, timeout: 60_000 },
      )
      .toBe(false);
    await commands.stopAdverseFixture();
    let fixtureStopped = true;
    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    const secondSessionCapture: {
      current: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
    } = { current: null };

    try {
      await act(async () => {
        secondRoot.render(
          createElement(AdverseZerospinApp.Provider, {
            aggregateIds: { shopperFrontend: 'acct_1' },
            generateSignature: () => Effect.succeed({ clerkUserId }),
            children: createElement(AdverseSessionProbe, {
              onSession: session => {
                secondSessionCapture.current = session;
              },
            }),
          }),
        );
        await Promise.resolve();
      });
      await expect
        .poll(
          () =>
            secondSessionCapture.current?.store.getState().isInitialized ??
            false,
          { interval: 100, timeout: 120_000 },
        )
        .toBe(true);
      const offlineSession = secondSessionCapture.current;
      if (offlineSession === null) {
        throw new Error('The offline-port session must initialize');
      }
      const offlineState = offlineSession.store.getState();
      if (!offlineState.isInitialized) {
        throw new Error('The offline-port store must initialize');
      }
      expect(offlineState.sessionStatus).toBe('current');
      expect(offlineState.backupState.status).toBe('ready');
      expect(offlineState.userIndex).toBe(retainedUserIndex);
      expect(
        offlineState.db.query.user
          ?.findFirst({
            where: { id: { eq: userV1.prefixId(clerkUserId) } },
          })
          .sync()?.name,
      ).toBe(retainedName);

      const offlineUpdate = await offlineSession.executeCommand({
        contractName: 'updateUser',
        payload: {
          id: userV1.prefixId(clerkUserId),
          name: `Promoted ${testRunId}`,
        },
      });
      if (offlineUpdate._tag === 'Failure') {
        throw new Error(offlineUpdate.failure.message);
      }
      await commands.startAdverseFixture();
      fixtureStopped = false;
      globalThis.dispatchEvent(new Event('online'));
      await expect
        .poll(
          () => {
            const state = offlineSession.store.getState();
            if (!state.isInitialized) return undefined;
            return state.db
              .select({
                pushIndex: sessionCommandJournalDrizzleSchema.pushIndex,
              })
              .from(sessionCommandJournalDrizzleSchema)
              .where(
                eq(
                  sessionCommandJournalDrizzleSchema.id,
                  offlineUpdate.success.id,
                ),
              )
              .get()?.pushIndex;
          },
          {
            interval: 100,
            timeout: 120_000,
          },
        )
        .toBeGreaterThan(0);
      expect(offlineSession.store.getState().isInitialized).toBe(true);
    } finally {
      if (fixtureStopped) {
        await commands.startAdverseFixture();
      }
      await act(async () => {
        secondRoot.unmount();
        await Promise.resolve();
      });
      secondContainer.remove();
    }
  }, 300_000);

  it('resumes the main-thread replica after Chromium terminates the IndexedDB worker', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using systemApi = await gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test',
            });
            await Effect.runPromise(
              decodeRpc(
                (await systemApi.healthcheck({ args: [], traceContext: null }))
                  .result,
              ),
            );
            return true;
          } catch {
            return false;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(true);
    const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(
      `adverse-worker-restart-user-${testRunId}`,
    );
    const firstContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);
    const firstSessionCapture: {
      current: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
    } = { current: null };

    await act(async () => {
      firstRoot.render(
        createElement(AdverseZerospinApp.Provider, {
          aggregateIds: { shopperFrontend: 'acct_1' },
          generateSignature: () => Effect.succeed({ clerkUserId }),
          children: createElement(AdverseSessionProbe, {
            onSession: session => {
              firstSessionCapture.current = session;
            },
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          firstSessionCapture.current?.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const firstSession = firstSessionCapture.current;
    if (firstSession === null) {
      throw new Error('The first worker-backed session must initialize');
    }
    const createdUser = await firstSession.executeCommand({
      contractName: 'createUser',
      payload: {
        id: userV1.prefixId(clerkUserId),
        clerkUserId,
      },
    });
    if (createdUser._tag === 'Failure') {
      throw new Error(createdUser.failure.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return state.db
            .select({ pushIndex: sessionCommandJournalDrizzleSchema.pushIndex })
            .from(sessionCommandJournalDrizzleSchema)
            .where(
              eq(sessionCommandJournalDrizzleSchema.id, createdUser.success.id),
            )
            .get()?.pushIndex;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    const restartedName = `Persisted through worker restart ${testRunId}`;
    const updatedUser = await firstSession.executeCommand({
      contractName: 'updateUser',
      payload: {
        id: userV1.prefixId(clerkUserId),
        name: restartedName,
      },
    });
    if (updatedUser._tag === 'Failure') {
      throw new Error(updatedUser.failure.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return state.db
            .select({ pushIndex: sessionCommandJournalDrizzleSchema.pushIndex })
            .from(sessionCommandJournalDrizzleSchema)
            .where(
              eq(sessionCommandJournalDrizzleSchema.id, updatedUser.success.id),
            )
            .get()?.pushIndex;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    const firstState = firstSession.store.getState();
    if (!firstState.isInitialized) {
      throw new Error('The first main-thread session must be current');
    }
    const persistedUserIndex = firstState.userIndex;

    const { cdp } = await import('vitest/browser');
    const targets = await cdp().send('Target.getTargets');
    const backupWorkerTarget = targets.targetInfos.find(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('/__zerospin/backup-worker.js'),
    );
    if (backupWorkerTarget === undefined) {
      throw new Error(
        'Chromium must expose the real IndexedDB backup SharedWorker',
      );
    }
    const closedTarget = await cdp().send('Target.closeTarget', {
      targetId: backupWorkerTarget.targetId,
    });
    expect(closedTarget.success).toBe(true);
    await expect
      .poll(
        async () => {
          const targetsAfterTermination = await cdp().send('Target.getTargets');
          return targetsAfterTermination.targetInfos.some(
            target => target.targetId === backupWorkerTarget.targetId,
          );
        },
        { interval: 100, timeout: 60_000 },
      )
      .toBe(false);

    await act(async () => {
      firstRoot.unmount();
      await Promise.resolve();
    });
    firstContainer.remove();

    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    const secondSessionCapture: {
      current: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
    } = { current: null };
    try {
      await act(async () => {
        secondRoot.render(
          createElement(AdverseZerospinApp.Provider, {
            aggregateIds: { shopperFrontend: 'acct_1' },
            generateSignature: () => Effect.succeed({ clerkUserId }),
            children: createElement(AdverseSessionProbe, {
              onSession: session => {
                secondSessionCapture.current = session;
              },
            }),
          }),
        );
        await Promise.resolve();
      });
      await expect
        .poll(
          () =>
            secondSessionCapture.current?.store.getState().isInitialized ??
            false,
          { interval: 100, timeout: 120_000 },
        )
        .toBe(true);
      const secondSession = secondSessionCapture.current;
      if (secondSession === null) {
        throw new Error('The restarted worker-backed session must initialize');
      }
      const secondState = secondSession.store.getState();
      if (!secondState.isInitialized) {
        throw new Error('The restarted main-thread store must initialize');
      }
      expect(secondState.sessionStatus).toBe('current');
      expect(secondState.backupState.status).toBe('ready');
      expect(secondState.userIndex).toBeGreaterThanOrEqual(persistedUserIndex);
      expect(
        secondState.db.query.user
          ?.findFirst({
            where: { id: { eq: userV1.prefixId(clerkUserId) } },
          })
          .sync()?.name,
      ).toBe(restartedName);
      const restartedTargets = await cdp().send('Target.getTargets');
      const restartedBackupWorker = restartedTargets.targetInfos.find(
        target =>
          target.type === 'shared_worker' &&
          target.url.includes('/__zerospin/backup-worker.js'),
      );
      expect(restartedBackupWorker?.targetId).not.toBe(
        backupWorkerTarget.targetId,
      );
    } finally {
      await act(async () => {
        secondRoot.unmount();
        await Promise.resolve();
      });
      secondContainer.remove();
    }
  }, 300_000);
});
