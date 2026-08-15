/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, useEffect } from 'react';

import type {} from '@vitest/browser-playwright';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { sessionExecutedPushedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import { makeZerospinApp } from '@zerospin/react/makeZerospinApp';
import type { IBrowserSession } from '@zerospin/react/types';
import { useSession } from '@zerospin/react/useSession';
import { newWebSocketRpcSession } from 'capnweb';
import { eq } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';

import { authenticationSignature } from '@/zerospin/authentication';
import { shopperFrontend as authoredShopperFrontend } from '@/zerospin/frontend';
import { ClerkUserIdSchema, User } from '@/zerospin/models';

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
    makePrefixedIncrementalIdFactory('reactSharedWorkerAdverse'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApiUrl, 'http://127.0.0.1:3035/'),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  ),
);

const AdverseZerospinApp = makeZerospinApp({
  systemName: 'shopping',
  authentication: { signature: authenticationSignature },
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

describe('React SharedWorker adverse acceptance', () => {
  it('publishes no session when the worker-owned authentication callback fails', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using devDeployApi = await gatewayApi.getDevDeployApi();
            await Effect.runPromise(
              decodeRpc(await devDeployApi.getReadiness()),
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
      `adverse-worker-auth-user-${testRunId}`,
    );
    const aggregateSessionCountBefore =
      zerospinDevtoolsStore.getState().aggregateSessionsById.size;
    const databaseNamesBefore = new Set(
      (await globalThis.indexedDB.databases()).flatMap(database =>
        database.name === undefined ? [] : [database.name],
      ),
    );
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
      expect(
        Array.from(
          zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
        ).filter(rootDiagnostics => rootDiagnostics.userId === clerkUserId),
      ).toEqual([]);
      const databaseNamesAfter = new Set(
        (await globalThis.indexedDB.databases()).flatMap(database =>
          database.name === undefined ? [] : [database.name],
        ),
      );
      expect(
        [...databaseNamesAfter].filter(name => !databaseNamesBefore.has(name)),
      ).toEqual([]);
    } finally {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
    }
  });

  it('hydrates existing-only while transport is unavailable and promotes online', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using devDeployApi = await gatewayApi.getDevDeployApi();
            await Effect.runPromise(
              decodeRpc(await devDeployApi.getReadiness()),
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

    const createdUser = await firstSession.stageCommand({
      contractName: 'createUser',
      payload: {
        id: User.prefixId(clerkUserId),
        clerkUserId,
      },
    });
    if (createdUser._tag === 'Left') {
      throw new Error(createdUser.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return state.db
            .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(
                sessionExecutedPushedCommandDrizzleSchema.id,
                createdUser.right.id,
              ),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(createdUser.right.id);
    const retainedName = `Retained offline ${testRunId}`;
    const updatedUser = await firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: retainedName,
      },
    });
    if (updatedUser._tag === 'Left') {
      throw new Error(updatedUser.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return state.db
            .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(
                sessionExecutedPushedCommandDrizzleSchema.id,
                updatedUser.right.id,
              ),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(updatedUser.right.id);
    const firstState = firstSession.store.getState();
    if (!firstState.isInitialized || firstState.replicaIndex === null) {
      throw new Error('The online session must reach a persisted index');
    }
    const retainedDatabaseName = firstState.workerState.databaseName;
    const retainedReplicaIndex = firstState.replicaIndex;

    await act(async () => {
      firstRoot.unmount();
      await Promise.resolve();
    });
    firstContainer.remove();

    const { cdp } = await import('vitest/browser');
    const targets = await cdp().send('Target.getTargets');
    const sharedWorkerTarget = targets.targetInfos.find(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('sharedWorker.bundle.js'),
    );
    if (sharedWorkerTarget === undefined) {
      throw new Error('Chromium must expose the seeded Zerospin SharedWorker');
    }
    const closedTarget = await cdp().send('Target.closeTarget', {
      targetId: sharedWorkerTarget.targetId,
    });
    expect(closedTarget.success).toBe(true);
    await expect
      .poll(
        async () => {
          const remainingTargets = await cdp().send('Target.getTargets');
          return remainingTargets.targetInfos.some(
            target => target.targetId === sharedWorkerTarget.targetId,
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
        throw new Error('The existing-only session must initialize');
      }
      const offlineState = offlineSession.store.getState();
      if (!offlineState.isInitialized) {
        throw new Error('The existing-only store must initialize');
      }
      expect(offlineState.workerState).toMatchObject({
        bootstrapSource: 'replica',
        databaseName: retainedDatabaseName,
        mode: 'shared-worker',
        status: 'offline',
      });
      expect(offlineState.replicaIndex).toBe(retainedReplicaIndex);
      expect(
        offlineState.db.query.user
          ?.findFirst({
            where: { id: { eq: User.prefixId(clerkUserId) } },
          })
          .sync()?.name,
      ).toBe(retainedName);

      await commands.startAdverseFixture();
      fixtureStopped = false;
      globalThis.dispatchEvent(new Event('online'));
      await expect
        .poll(() => offlineSession.store.getState().workerState.status, {
          interval: 100,
          timeout: 120_000,
        })
        .toBe('online');
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

  it('resumes the persisted replica after Chromium terminates the SharedWorker', async () => {
    await expect
      .poll(
        async () => {
          try {
            using gatewayApi = newWebSocketRpcSession<GatewayApi>(
              'ws://127.0.0.1:3035/',
            );
            using devDeployApi = await gatewayApi.getDevDeployApi();
            await Effect.runPromise(
              decodeRpc(await devDeployApi.getReadiness()),
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
    const createdUser = await firstSession.stageCommand({
      contractName: 'createUser',
      payload: {
        id: User.prefixId(clerkUserId),
        clerkUserId,
      },
    });
    if (createdUser._tag === 'Left') {
      throw new Error(createdUser.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return state.db
            .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(
                sessionExecutedPushedCommandDrizzleSchema.id,
                createdUser.right.id,
              ),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(createdUser.right.id);
    const restartedName = `Persisted through worker restart ${testRunId}`;
    const staged = await firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: restartedName,
      },
    });
    if (staged._tag === 'Left') {
      throw new Error(staged.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) return undefined;
          return state.db
            .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(sessionExecutedPushedCommandDrizzleSchema.id, staged.right.id),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(staged.right.id);
    const firstState = firstSession.store.getState();
    if (!firstState.isInitialized || firstState.replicaIndex === null) {
      throw new Error('The first worker-backed session must be current');
    }
    const persistedDatabaseName = firstState.workerState.databaseName;
    const persistedReplicaIndex = firstState.replicaIndex;

    const { cdp } = await import('vitest/browser');
    const targets = await cdp().send('Target.getTargets');
    const sharedWorkerTarget = targets.targetInfos.find(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('sharedWorker.bundle.js'),
    );
    if (sharedWorkerTarget === undefined) {
      throw new Error('Chromium must expose the real Zerospin SharedWorker');
    }
    const closedTarget = await cdp().send('Target.closeTarget', {
      targetId: sharedWorkerTarget.targetId,
    });
    expect(closedTarget.success).toBe(true);
    await expect
      .poll(
        async () => {
          const targetsAfterTermination = await cdp().send('Target.getTargets');
          return targetsAfterTermination.targetInfos.some(
            target => target.targetId === sharedWorkerTarget.targetId,
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
      if (!secondState.isInitialized || secondState.replicaIndex === null) {
        throw new Error('The restarted worker-backed store must initialize');
      }
      expect(secondState.workerState).toMatchObject({
        bootstrapSource: 'replica',
        databaseName: persistedDatabaseName,
        mode: 'shared-worker',
        status: 'online',
      });
      expect(secondState.replicaIndex).toBeGreaterThanOrEqual(
        persistedReplicaIndex,
      );
      expect(
        secondState.db.query.user
          ?.findFirst({
            where: { id: { eq: User.prefixId(clerkUserId) } },
          })
          .sync()?.name,
      ).toBe(restartedName);
      const restartedTargets = await cdp().send('Target.getTargets');
      const restartedSharedWorker = restartedTargets.targetInfos.find(
        target =>
          target.type === 'shared_worker' &&
          target.url.includes('sharedWorker.bundle.js'),
      );
      expect(restartedSharedWorker?.targetId).not.toBe(
        sharedWorkerTarget.targetId,
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
