/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, useEffect } from 'react';

import type {} from '@vitest/browser-playwright';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { acquireOpfsBackupWorker } from '@zerospin/opfs-backup-worker';
import { makeZerospinApp } from '@zerospin/react/makeZerospinApp';
import type { IBrowserSession } from '@zerospin/react/types';
import { useSession } from '@zerospin/react/useSession';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { newMessagePortRpcSession, newWebSocketRpcSession } from 'capnweb';
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
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';

import { web as authoredShopperFrontend } from '@/zerospin/frontends/web';
import { ClerkUserIdSchema, User } from '@/zerospin/models/User';
import { signature } from '@/zerospin/signature';
import type { OpfsBackupLeaderApi } from '../../../../packages/opfs-backup-worker/src/OpfsBackupLeader/OpfsBackupLeaderApi.ts';

declare module 'vitest/browser' {
  interface BrowserCommands {
    startAdverseFixture(): Promise<void>;
    stopAdverseFixture(): Promise<void>;
  }
}

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

const adverseRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('mainThreadOpfsAdverse'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApiUrl, 'http://127.0.0.1:3035/'),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  ),
);

const AdverseZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: { signature },
  frontends: {
    web: {
      controller: authoredShopperFrontend,
      contracts: { updateCartItemQuantity: '1.0.0' },
    },
  },
  runtime: adverseRuntime,
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await adverseRuntime.dispose();
});

describe('main-thread OPFS adverse acceptance', () => {
  it('round-trips a snapshot, transfers its claim, applies FIFO SQL, and deletes only after close', async () => {
    const backupKey = 'd'.repeat(64);
    const sessionId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema('sesn'),
    )(`sesn_opfs_${testRunId}`);

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const firstWorker = yield* acquireOpfsBackupWorker();
          const secondWorker = yield* acquireOpfsBackupWorker();
          const { cdp } = yield* Effect.promise(() => import('vitest/browser'));
          yield* Effect.promise(() =>
            expect
              .poll(
                async () => {
                  const targets = await cdp().send('Target.getTargets');
                  return targets.targetInfos.filter(
                    target =>
                      target.type === 'worker' &&
                      target.url.includes('opfsBackupLeader.bundle.js'),
                  ).length;
                },
                { interval: 100, timeout: 60_000 },
              )
              .toBe(1),
          );
          const dbConfig = makeResourceDbConfig({
            models: {},
            otherTables: {},
          });
          const source = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          source.run(
            sql.raw(
              'CREATE TABLE opfs_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
            ),
          );
          source.run(
            sql.raw("INSERT INTO opfs_test (id, value) VALUES (1, 'baseline')"),
          );
          const baseline = source.$client.sqlite3.serialize(
            source.$client.db,
            'main',
          );

          yield* firstWorker.replaceSnapshot({
            backupKey,
            sessionId,
            snapshot: baseline,
          });
          expect(yield* firstWorker.listSessionBackups({ backupKey })).toEqual([
            sessionId,
          ]);
          const exported = yield* firstWorker.exportSnapshot({
            backupKey,
            sessionId,
          });
          expect(exported).not.toBeNull();

          yield* secondWorker.replaceSnapshot({
            backupKey,
            sessionId,
            snapshot: baseline,
          });
          const nonClaimant = yield* firstWorker
            .applyTransaction({
              backupKey,
              sessionId,
              statements: [
                {
                  sql: 'INSERT INTO opfs_test (id, value) VALUES (?, ?)',
                  parameters: [2, 'wrong-owner'],
                },
              ],
            })
            .pipe(Effect.result);
          expect(Result.isFailure(nonClaimant)).toBe(true);

          const rolledBack = yield* secondWorker
            .applyTransaction({
              backupKey,
              sessionId,
              statements: [
                {
                  sql: 'INSERT INTO opfs_test (id, value) VALUES (?, ?)',
                  parameters: [2, 'must-roll-back'],
                },
                {
                  sql: 'INSERT INTO opfs_test (id, value) VALUES (?, ?)',
                  parameters: [1, 'duplicate'],
                },
              ],
            })
            .pipe(Effect.result);
          expect(Result.isFailure(rolledBack)).toBe(true);
          const afterRollback = yield* secondWorker.exportSnapshot({
            backupKey,
            sessionId,
          });
          if (afterRollback === null) {
            throw new Error('Expected the rolled-back OPFS snapshot');
          }
          const rollbackCheck = yield* makeProvisionedInMemoryWasmSqliteDb({
            dbConfig,
          });
          const rollbackDeserializeResult =
            rollbackCheck.$client.sqlite3.deserialize(
              rollbackCheck.$client.db,
              'main',
              afterRollback,
              afterRollback.byteLength,
              afterRollback.byteLength,
              1,
            );
          expect(rollbackDeserializeResult).toBe(0);
          expect(
            rollbackCheck.all(
              sql.raw('SELECT id, value FROM opfs_test ORDER BY id'),
            ),
          ).toEqual([{ id: 1, value: 'baseline' }]);
          yield* Effect.sync(() =>
            rollbackCheck.$client.sqlite3.close(rollbackCheck.$client.db),
          );

          yield* secondWorker.applyTransaction({
            backupKey,
            sessionId,
            statements: [
              {
                sql: 'INSERT INTO opfs_test (id, value) VALUES (?, ?)',
                parameters: [2, 'second'],
              },
              {
                sql: 'UPDATE opfs_test SET value = ? WHERE id = ?',
                parameters: ['updated', 2],
              },
            ],
          });
          expect(
            yield* firstWorker.deleteSessionBackup({ backupKey, sessionId }),
          ).toBe('in-use');

          const updated = yield* secondWorker.exportSnapshot({
            backupKey,
            sessionId,
          });
          if (updated === null) throw new Error('Expected the OPFS snapshot');
          const restored = yield* makeProvisionedInMemoryWasmSqliteDb({
            dbConfig,
          });
          const deserializeResult = restored.$client.sqlite3.deserialize(
            restored.$client.db,
            'main',
            updated,
            updated.byteLength,
            updated.byteLength,
            1,
          );
          expect(deserializeResult).toBe(0);
          expect(
            restored.all(
              sql.raw('SELECT id, value FROM opfs_test ORDER BY id'),
            ),
          ).toEqual([
            { id: 1, value: 'baseline' },
            { id: 2, value: 'updated' },
          ]);

          yield* secondWorker.closeSessionBackup({ backupKey, sessionId });
          const targets = yield* Effect.promise(() =>
            cdp().send('Target.getTargets'),
          );
          const backupWorkerTarget = targets.targetInfos.find(
            target =>
              target.type === 'shared_worker' &&
              target.url.includes('opfsBackupWorker.bundle.js'),
          );
          if (backupWorkerTarget === undefined) {
            throw new Error('Chromium must expose the OPFS backup SharedWorker');
          }
          const closedTarget = yield* Effect.promise(() =>
            cdp().send('Target.closeTarget', {
              targetId: backupWorkerTarget.targetId,
            }),
          );
          expect(closedTarget.success).toBe(true);
          yield* Effect.promise(() =>
            expect
              .poll(
                async () => {
                  const remainingTargets = await cdp().send(
                    'Target.getTargets',
                  );
                  return remainingTargets.targetInfos.some(
                    target => target.targetId === backupWorkerTarget.targetId,
                  );
                },
                { interval: 100, timeout: 60_000 },
              )
              .toBe(false),
          );
          const restartedWorker = yield* acquireOpfsBackupWorker();
          const reopened = yield* restartedWorker.exportSnapshot({
            backupKey,
            sessionId,
          });
          if (reopened === null) {
            throw new Error('Expected the closed OPFS snapshot');
          }
          const reopenedResult = restored.$client.sqlite3.deserialize(
            restored.$client.db,
            'main',
            reopened,
            reopened.byteLength,
            reopened.byteLength,
            1,
          );
          expect(reopenedResult).toBe(0);
          expect(
            restored.all(
              sql.raw('SELECT id, value FROM opfs_test ORDER BY id'),
            ),
          ).toEqual([
            { id: 1, value: 'baseline' },
            { id: 2, value: 'updated' },
          ]);
          expect(
            yield* restartedWorker.deleteSessionBackup({
              backupKey,
              sessionId,
            }),
          ).toBe('deleted');
          expect(
            yield* restartedWorker.deleteSessionBackup({
              backupKey,
              sessionId,
            }),
          ).toBe('missing');
          yield* Effect.sync(() =>
            source.$client.sqlite3.close(source.$client.db),
          );
          yield* Effect.sync(() =>
            restored.$client.sqlite3.close(restored.$client.db),
          );
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  });

  it('fences one session file across distinct dedicated-worker build URLs', async () => {
    const backupKey = 'e'.repeat(64);
    const sessionId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema('sesn'),
    )(`sesn_cross_build_${testRunId}`);

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const graphWorker = yield* acquireOpfsBackupWorker();
          yield* graphWorker.listSessionBackups({ backupKey }).pipe(
            Effect.retry({
              times: 1,
              while: error => error.code === 'opfs-backup-request-uncertain',
            }),
          );
          const { cdp } = yield* Effect.promise(() => import('vitest/browser'));
          const resolvedLeaderUrl = yield* Effect.promise(async () => {
            let leaderUrl: string | undefined;
            await expect
              .poll(
                async () => {
                const targets = await cdp().send('Target.getTargets');
                  leaderUrl = targets.targetInfos.find(
                  target =>
                    target.type === 'worker' &&
                    target.url.includes('opfsBackupLeader.bundle.js'),
                )?.url;
                  return leaderUrl;
                },
                { interval: 100, timeout: 60_000 },
              )
              .toBeTypeOf('string');
            if (leaderUrl === undefined) {
              throw new Error('Chromium must expose the dedicated leader URL');
            }
            return leaderUrl;
          });

          const firstLeader = new Worker(`${resolvedLeaderUrl}&build=first`, {
            name: 'zerospin:cross-build-first',
            type: 'module',
          });
          const firstChannel = new MessageChannel();
          firstLeader.postMessage(firstChannel.port1, [firstChannel.port1]);
          firstChannel.port2.start();
          const firstApi =
            newMessagePortRpcSession<OpfsBackupLeaderApi>(firstChannel.port2);
          const secondLeader = new Worker(`${resolvedLeaderUrl}&build=second`, {
            name: 'zerospin:cross-build-second',
            type: 'module',
          });
          const secondChannel = new MessageChannel();
          secondLeader.postMessage(secondChannel.port1, [secondChannel.port1]);
          secondChannel.port2.start();
          const secondApi =
            newMessagePortRpcSession<OpfsBackupLeaderApi>(secondChannel.port2);
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              firstApi[Symbol.dispose]();
              firstChannel.port2.close();
              firstLeader.terminate();
              secondApi[Symbol.dispose]();
              secondChannel.port2.close();
              secondLeader.terminate();
            }),
          );

          const dbConfig = makeResourceDbConfig({
            models: {},
            otherTables: {},
          });
          const source = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          source.run(sql.raw('CREATE TABLE cross_build (value TEXT NOT NULL)'));
          source.run(sql.raw("INSERT INTO cross_build (value) VALUES ('one')"));
          const snapshot = source.$client.sqlite3.serialize(
            source.$client.db,
            'main',
          );
          yield* Effect.promise(
            async (): Promise<IEncodedResult<void, IAnyErrorJson>> =>
              await firstApi.replaceSnapshot({
              backupClientId: 1,
              backupKey,
              sessionId,
              snapshot,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          let secondSettled = false;
          const secondReplace = (async (): Promise<
            IEncodedResult<void, IAnyErrorJson>
          > => {
            const result = await secondApi.replaceSnapshot({
              backupClientId: 2,
              backupKey,
              sessionId,
              snapshot,
            });
            secondSettled = true;
            return result;
          })();
          yield* Effect.promise(
            () => new Promise<void>(resolve => setTimeout(resolve, 100)),
          );
          expect(secondSettled).toBe(false);

          yield* Effect.promise(
            async (): Promise<IEncodedResult<void, IAnyErrorJson>> =>
              await firstApi.closeSessionBackup({
              backupClientId: 1,
              backupKey,
              sessionId,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* Effect.promise(() => secondReplace).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* Effect.promise(
            async (): Promise<IEncodedResult<void, IAnyErrorJson>> =>
              await secondApi.closeSessionBackup({
              backupClientId: 2,
              backupKey,
              sessionId,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* graphWorker.deleteSessionBackup({ backupKey, sessionId });
          yield* Effect.sync(() =>
            source.$client.sqlite3.close(source.$client.db),
          );
        }).pipe(Effect.provide(AsyncLive)),
      ),
    );
  });

  it('elects a replacement leader after its hosting window disappears', async () => {
    const token = `leader-frame-${testRunId}`;
    const frameReady = Promise.withResolvers<void>();
    const frameFailed = Promise.withResolvers<Error>();
    const onFrameMessage = (event: MessageEvent) => {
      if (event.data?.token !== token) return;
      if (event.data.type === 'OpfsLeaderFrameReady') frameReady.resolve();
      if (event.data.type === 'OpfsLeaderFrameFailed') {
        frameFailed.resolve(new Error(event.data.cause));
      }
    };
    globalThis.addEventListener('message', onFrameMessage);
    const frame = document.createElement('iframe');
    frame.src = `/tests/browser/opfsBackupLeaderFrame.html?token=${encodeURIComponent(token)}`;
    document.body.appendChild(frame);

    try {
      await Promise.race([
        frameReady.promise,
        frameFailed.promise.then(error => Promise.reject(error)),
      ]);
      const { cdp } = await import('vitest/browser');
      let capturedOriginalLeader: Readonly<{ targetId: string }> | undefined;
      await expect
        .poll(
          async () => {
            const targets = await cdp().send('Target.getTargets');
            const target = targets.targetInfos.find(
              candidate =>
                candidate.type === 'worker' &&
                candidate.url.includes('opfsBackupLeader.bundle.js'),
            );
            capturedOriginalLeader = target;
            return target?.targetId;
          },
          { interval: 100, timeout: 60_000 },
        )
        .toBeTypeOf('string');
      if (capturedOriginalLeader === undefined) {
        throw new Error('The leader frame must host a dedicated worker');
      }

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const replacementClient = yield* acquireOpfsBackupWorker();
            frame.remove();
            yield* Effect.promise(() =>
              expect
                .poll(
                  async () => {
                    const targets = await cdp().send('Target.getTargets');
                    return targets.targetInfos.some(
                      target =>
                        target.targetId ===
                        capturedOriginalLeader?.targetId,
                    );
                  },
                  { interval: 100, timeout: 60_000 },
                )
                .toBe(false),
            );
            const firstRead = yield* replacementClient
              .listSessionBackups({ backupKey: 'f'.repeat(64) })
              .pipe(Effect.result);
            if (Result.isFailure(firstRead)) {
              expect(firstRead.failure.code).toBe(
                'opfs-backup-request-uncertain',
              );
              expect(
                yield* replacementClient.listSessionBackups({
                  backupKey: 'f'.repeat(64),
                }),
              ).toEqual([]);
            } else {
              expect(firstRead.success).toEqual([]);
            }
            yield* Effect.promise(() =>
              expect
                .poll(
                  async () => {
                    const targets = await cdp().send('Target.getTargets');
                    return targets.targetInfos.some(
                      target =>
                        target.type === 'worker' &&
                        target.url.includes('opfsBackupLeader.bundle.js') &&
                        target.targetId !==
                          capturedOriginalLeader?.targetId,
                    );
                  },
                  { interval: 100, timeout: 60_000 },
                )
                .toBe(true),
            );
          }),
        ),
      );
    } finally {
      frame.remove();
      globalThis.removeEventListener('message', onFrameMessage);
    }
  });

  it('supersedes an older tab after a newer exact-target session publishes its locator', async () => {
    const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(
      `adverse-multi-tab-user-${testRunId}`,
    );
    const firstContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);
    const firstCapture: {
      current: IBrowserSession<
        typeof AdverseZerospinApp.frontends.web.frontend
      > | null;
    } = { current: null };

    try {
      await act(async () => {
        firstRoot.render(
          createElement(AdverseZerospinApp.Provider, {
            aggregateIds: { shopper: 'acct_1' },
            generateSignature: () => Effect.succeed({ clerkUserId }),
            children: createElement(AdverseSessionProbe, {
              onSession: session => {
                firstCapture.current = session;
              },
            }),
          }),
        );
        await Promise.resolve();
      });
      await expect
        .poll(
          () => firstCapture.current?.store.getState().isInitialized ?? false,
          { interval: 100, timeout: 120_000 },
        )
        .toBe(true);

      const firstSession = firstCapture.current;
      if (firstSession === null) {
        throw new Error('The older tab session must initialize');
      }
      const sessionLocatorKey = Array.from(
        { length: globalThis.localStorage.length },
        (_, index) => globalThis.localStorage.key(index),
      ).find(
        key =>
          key?.startsWith('zerospin:frontend-session:') === true &&
          globalThis.localStorage.getItem(key) === firstSession.sessionId,
      );
      if (sessionLocatorKey === undefined || sessionLocatorKey === null) {
        throw new Error('The older tab must publish its exact-target locator');
      }
      const newerSessionId = Schema.decodeUnknownSync(
        makeAbbreviationIdSchema('sesn'),
      )(`sesn_newer_tab_${testRunId}`);

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      globalThis.localStorage.setItem(sessionLocatorKey, newerSessionId);
      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key: sessionLocatorKey,
          newValue: newerSessionId,
          oldValue: firstSession.sessionId,
          storageArea: globalThis.localStorage,
        }),
      );
      expect(firstSession.store.getState().sessionStatus).toBe('superseded');
      expect(globalThis.localStorage.getItem(sessionLocatorKey)).toBe(
        newerSessionId,
      );
      expect(
        await firstSession.executeCommand({
          contractName: 'createUser',
          payload: {
            id: User.prefixId(clerkUserId),
            clerkUserId,
          },
        }),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-frontend-session-not-current' },
      });
    } finally {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      await act(async () => {
        firstRoot.unmount();
        await Promise.resolve();
      });
      firstContainer.remove();
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
            aggregateIds: { shopper: 'acct_1' },
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
          aggregateIds: { shopper: 'acct_1' },
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
        id: User.prefixId(clerkUserId),
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
        id: User.prefixId(clerkUserId),
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
    const retainedFrontendIndex = firstSession.store.getState().frontendIndex;

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
        target.url.includes('opfsBackupWorker.bundle.js'),
    );
    if (backupWorkerTarget === undefined) {
      throw new Error(
        'Chromium must expose the seeded OPFS backup SharedWorker',
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
            aggregateIds: { shopper: 'acct_1' },
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
      expect(offlineState.frontendIndex).toBe(retainedFrontendIndex);
      expect(
        offlineState.db.query.user
          ?.findFirst({
            where: { id: { eq: User.prefixId(clerkUserId) } },
          })
          .sync()?.name,
      ).toBe(retainedName);

      const offlineUpdate = await offlineSession.executeCommand({
        contractName: 'updateUser',
        payload: {
          id: User.prefixId(clerkUserId),
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

  it('resumes the main-thread replica after Chromium terminates the OPFS worker', async () => {
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
          aggregateIds: { shopper: 'acct_1' },
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
        id: User.prefixId(clerkUserId),
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
        id: User.prefixId(clerkUserId),
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
    const persistedFrontendIndex = firstState.frontendIndex;

    const { cdp } = await import('vitest/browser');
    const targets = await cdp().send('Target.getTargets');
    const backupWorkerTarget = targets.targetInfos.find(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('opfsBackupWorker.bundle.js'),
    );
    if (backupWorkerTarget === undefined) {
      throw new Error('Chromium must expose the real OPFS backup SharedWorker');
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
            aggregateIds: { shopper: 'acct_1' },
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
      expect(secondState.frontendIndex).toBeGreaterThanOrEqual(
        persistedFrontendIndex,
      );
      expect(
        secondState.db.query.user
          ?.findFirst({
            where: { id: { eq: User.prefixId(clerkUserId) } },
          })
          .sync()?.name,
      ).toBe(restartedName);
      const restartedTargets = await cdp().send('Target.getTargets');
      const restartedBackupWorker = restartedTargets.targetInfos.find(
        target =>
          target.type === 'shared_worker' &&
          target.url.includes('opfsBackupWorker.bundle.js'),
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
