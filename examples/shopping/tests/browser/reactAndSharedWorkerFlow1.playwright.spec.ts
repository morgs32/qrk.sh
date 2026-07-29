/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX, and every tested Provider requires children. */
import {
  act,
  createElement,
  createRef,
  StrictMode,
  type ComponentRef,
} from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeTelemetryLayer } from '@zerospin/logger';
import { bootstrapBrowserSession } from '@zerospin/react/bootstrapBrowserSession';
import { makeBrowserPartitionController } from '@zerospin/react/makeBrowserPartitionController';
import { makeReactFrontend } from '@zerospin/react/makeReactFrontend';
import { makeReactServiceFrontend } from '@zerospin/react/makeReactServiceFrontend';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { makeSharedWorkerSession } from '@zerospin/shared-worker/makeSharedWorkerSession';
import { Effect, Either, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { catalogFrontend, shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';

// React 19 consults this global before accepting `act` as the browser test
// scheduler. The native Vitest browser environment does not set it for us.
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const apiUrl = 'http://127.0.0.1:3035/';
const publishableKey = 'pk_test';
const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const partitionKey = `react-shared-worker-${testRunId}`;
const clerkUserId = `browser-account-${testRunId}`;
const catalogViewerId = `browser-catalog-${testRunId}`;

const testRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('reactAndSharedWorkerFlow1'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApisUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
);

// Each factory owns a distinct React context, like two separately loaded tabs.
// Both Config trees still address the same generation/partition SharedWorker.
const ReactAccount1 = makeReactFrontend({
  frontend: shopperFrontend,
  runtime: testRuntime,
});
const ReactService1 = makeReactServiceFrontend({
  frontend: catalogFrontend,
  runtime: testRuntime,
});
const ReactAccount2 = makeReactFrontend({
  frontend: shopperFrontend,
  runtime: testRuntime,
});
const ReactService2 = makeReactServiceFrontend({
  frontend: catalogFrontend,
  runtime: testRuntime,
});

const mountedRoots = new Set<ReturnType<typeof createRoot>>();
const mountedContainers = new Set<HTMLDivElement>();

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => {
    for (const root of mountedRoots) {
      root.unmount();
    }
    await Promise.resolve();
  });
  mountedRoots.clear();
  for (const container of mountedContainers) {
    container.remove();
  }
  mountedContainers.clear();
});

afterAll(async () => {
  await testRuntime.dispose();
});

describe('reactAndSharedWorkerFlow1', () => {
  it('runs real account and service replicas across two Config ports, offline hydration, and teardown', async () => {
    /*
     * 1. Wait for the real local Zerospin deployment barrier.
     * 2. Mount the first account/service Config tree and finish online admission.
     * 3. Mount a second independent tree against the same worker partition.
     * 4. Prove one account row and one service row each own two Config providers.
     * 5. Stage updateUser through the worker and observe both account databases.
     * 6. Prove the two read-only service databases are unchanged by that command.
     * 7. Remove and remount one Provider pair while its Config acquisition stays live.
     * 8. Tear down both Config roots and inspect retained zero-owner rows.
     * 9. Hydrate offline, stage durably, remount, regain authority, and settle once.
     * 10. Reject an invalid signature without consulting the cached locator.
     */

    // 1 — Vitest global setup starts the fixture-owned Zerospin server from
    // its isolated cwd. The readiness route remains the authority here.
    await expect
      .poll(
        async () => {
          try {
            const response = await fetch('/__zerospin/ready');
            return response.status;
          } catch {
            return 0;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(204);
    expect(
      globalThis.localStorage.getItem(
        `zerospin:frontend-locators:${partitionKey}`,
      ),
    ).toBeNull();

    const container1 = document.createElement('div');
    const container2 = document.createElement('div');
    document.body.appendChild(container1);
    document.body.appendChild(container2);
    mountedContainers.add(container1);
    mountedContainers.add(container2);
    const root1 = createRoot(container1);
    const root2 = createRoot(container2);
    mountedRoots.add(root1);
    mountedRoots.add(root2);

    const accountRef1 =
      createRef<ComponentRef<typeof ReactAccount1.Provider>>();
    const serviceRef1 =
      createRef<ComponentRef<typeof ReactService1.Provider>>();
    const accountRef2 =
      createRef<ComponentRef<typeof ReactAccount2.Provider>>();
    const serviceRef2 =
      createRef<ComponentRef<typeof ReactService2.Provider>>();

    // 2 — mount one complete Config tree first so concurrent first-use account
    // authentication cannot race creation of the same test user.
    await act(async () => {
      root1.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: ReactAccount1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactService1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(ReactAccount1.Provider, {
            ref: accountRef1,
            children: createElement(ReactService1.Provider, {
              ref: serviceRef1,
              children: createElement('div', null, 'first Config ready'),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () =>
          accountRef1.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          serviceRef1.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    // 3 — the second Config creates another MessagePort and another pair of
    // main-thread databases without creating another worker replica or socket.
    await act(async () => {
      root2.render(
        createElement(StrictMode, {
          children: createElement(ZerospinConfig, {
            frontendAuthenticators: {
              web: {
                frontend: ReactAccount2,
                generateSignature: () => Effect.succeed({ clerkUserId }),
              },
              catalog: {
                frontend: ReactService2,
                generateSignature: () =>
                  Effect.succeed({ viewerId: catalogViewerId }),
              },
            },
            isSharedWorkerEnabled: true,
            partitionKey,
            children: createElement(ReactAccount2.Provider, {
              ref: accountRef2,
              children: createElement(ReactService2.Provider, {
                ref: serviceRef2,
                children: createElement('div', null, 'second Config ready'),
              }),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () =>
          accountRef2.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          serviceRef2.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    const accountSession1 = accountRef1.current?.session;
    const accountSession2 = accountRef2.current?.session;
    const serviceSession1 = serviceRef1.current?.session;
    const serviceSession2 = serviceRef2.current?.session;
    expect(accountSession1).toBeDefined();
    expect(accountSession2).toBeDefined();
    expect(serviceSession1).toBeDefined();
    expect(serviceSession2).toBeDefined();
    if (
      accountSession1 === undefined ||
      accountSession2 === undefined ||
      serviceSession1 === undefined ||
      serviceSession2 === undefined
    ) {
      throw new Error('All four browser sessions must be mounted');
    }

    const accountState1 = accountSession1.store.getState();
    const accountState2 = accountSession2.store.getState();
    const serviceState1 = serviceSession1.store.getState();
    const serviceState2 = serviceSession2.store.getState();
    if (
      !accountState1.isInitialized ||
      !accountState2.isInitialized ||
      !serviceState1.isInitialized ||
      !serviceState2.isInitialized
    ) {
      throw new Error('All four browser session stores must be initialized');
    }

    expect(accountState1.db).not.toBe(accountState2.db);
    expect(serviceState1.db).not.toBe(serviceState2.db);
    expect(accountState1.workerState).toMatchObject({
      mode: 'shared-worker',
      status: 'online',
      bootstrapSource: 'replica',
    });
    expect(serviceState1.workerState).toMatchObject({
      mode: 'shared-worker',
      status: 'online',
      bootstrapSource: 'replica',
    });
    expect(
      globalThis.localStorage.getItem(
        `zerospin:frontend-locators:${partitionKey}`,
      ),
    ).not.toBeNull();

    // 4 — both DevTools root handles point at the same persisted partition.
    // Either handle can therefore prove exactly one row per frontend family.
    const diagnosticRoots = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).filter(root => root.partitionKey === partitionKey);
    expect(diagnosticRoots).toHaveLength(2);
    const diagnosticRoot = diagnosticRoots[0];
    if (diagnosticRoot === undefined) {
      throw new Error('Expected a SharedWorker diagnostic root');
    }

    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
          );
          return {
            accountCount: accountRows.length,
            accountProviders: accountRows[0]?.activeProviderCount,
            accountSocket: accountRows[0]?.socketState,
            serviceCount: serviceRows.length,
            serviceProviders: serviceRows[0]?.activeProviderCount,
            serviceSocket: serviceRows[0]?.socketState,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        accountCount: 1,
        accountProviders: 2,
        accountSocket: 'online',
        serviceCount: 1,
        serviceProviders: 2,
        serviceSocket: 'online',
      });

    const accountRowsBeforeStage = await Effect.runPromise(
      decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
    );
    const serviceRowsBeforeStage = await Effect.runPromise(
      decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
    );
    const accountRowBeforeStage = accountRowsBeforeStage[0];
    const serviceRowBeforeStage = serviceRowsBeforeStage[0];
    if (
      accountRowBeforeStage === undefined ||
      serviceRowBeforeStage === undefined
    ) {
      throw new Error('Expected account and service diagnostic rows');
    }
    expect(accountRowBeforeStage.databaseName).not.toBe(
      serviceRowBeforeStage.databaseName,
    );
    expect(accountState1.workerState.databaseName).toBe(
      accountRowBeforeStage.databaseName,
    );
    expect(accountState2.workerState.databaseName).toBe(
      accountRowBeforeStage.databaseName,
    );
    expect(serviceState1.workerState.databaseName).toBe(
      serviceRowBeforeStage.databaseName,
    );
    expect(serviceState2.workerState.databaseName).toBe(
      serviceRowBeforeStage.databaseName,
    );

    // 5 — one journal-first worker transaction fans its optimistic resource
    // change into both account sessions. A later server terminal transaction
    // may advance the shared index again, so equality and monotonicity are the
    // important assertions rather than one hard-coded final index.
    const initialAccountReplicaIndex1 = accountState1.replicaIndex;
    const initialAccountReplicaIndex2 = accountState2.replicaIndex;
    expect(initialAccountReplicaIndex1).not.toBeNull();
    expect(initialAccountReplicaIndex2).toBe(initialAccountReplicaIndex1);
    const initialServiceReplicaIndex1 = serviceState1.replicaIndex;
    const initialServiceReplicaIndex2 = serviceState2.replicaIndex;
    const serviceProductQueryBefore1 = serviceState1.db.query.product;
    const serviceProductQueryBefore2 = serviceState2.db.query.product;
    if (
      serviceProductQueryBefore1 === undefined ||
      serviceProductQueryBefore2 === undefined
    ) {
      throw new Error('Service Product queries must be present');
    }
    const serviceProductsBefore1 = serviceProductQueryBefore1.findMany().sync();
    const serviceProductsBefore2 = serviceProductQueryBefore2.findMany().sync();
    const updatedName = `Shared worker fanout ${testRunId}`;
    const staged = await accountSession1.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: updatedName,
      },
    });
    expect(staged._tag).toBe('Right');

    await expect
      .poll(
        () => {
          const currentState1 = accountSession1.store.getState();
          const currentState2 = accountSession2.store.getState();
          if (!currentState1.isInitialized || !currentState2.isInitialized) {
            return null;
          }
          const currentUserQuery1 = currentState1.db.query.user;
          const currentUserQuery2 = currentState2.db.query.user;
          if (
            currentUserQuery1 === undefined ||
            currentUserQuery2 === undefined
          ) {
            return null;
          }
          return {
            firstName: currentUserQuery1
              .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
              .sync()?.name,
            firstReplicaIndex: currentState1.replicaIndex,
            secondName: currentUserQuery2
              .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
              .sync()?.name,
            secondReplicaIndex: currentState2.replicaIndex,
          };
        },
        { interval: 50, timeout: 120_000 },
      )
      .toEqual(
        expect.objectContaining({
          firstName: updatedName,
          secondName: updatedName,
        }),
      );

    const accountStateAfterStage1 = accountSession1.store.getState();
    const accountStateAfterStage2 = accountSession2.store.getState();
    if (
      !accountStateAfterStage1.isInitialized ||
      !accountStateAfterStage2.isInitialized ||
      initialAccountReplicaIndex1 === null
    ) {
      throw new Error('Account sessions must remain initialized after stage');
    }
    expect(accountStateAfterStage1.replicaIndex).not.toBeNull();
    expect(accountStateAfterStage1.replicaIndex).toBe(
      accountStateAfterStage2.replicaIndex,
    );
    expect(accountStateAfterStage1.replicaIndex).toBeGreaterThan(
      initialAccountReplicaIndex1,
    );

    // 6 — the account command never enters the service frontend family. Its
    // replica indices and projected Product bytes remain unchanged in both DBs.
    const serviceStateAfterStage1 = serviceSession1.store.getState();
    const serviceStateAfterStage2 = serviceSession2.store.getState();
    if (
      !serviceStateAfterStage1.isInitialized ||
      !serviceStateAfterStage2.isInitialized
    ) {
      throw new Error('Service sessions must remain initialized after stage');
    }
    expect(serviceStateAfterStage1.replicaIndex).toBe(
      initialServiceReplicaIndex1,
    );
    expect(serviceStateAfterStage2.replicaIndex).toBe(
      initialServiceReplicaIndex2,
    );
    const serviceProductQueryAfterStage1 =
      serviceStateAfterStage1.db.query.product;
    const serviceProductQueryAfterStage2 =
      serviceStateAfterStage2.db.query.product;
    if (
      serviceProductQueryAfterStage1 === undefined ||
      serviceProductQueryAfterStage2 === undefined
    ) {
      throw new Error(
        'Service Product queries must remain present after stage',
      );
    }
    expect(serviceProductQueryAfterStage1.findMany().sync()).toEqual(
      serviceProductsBefore1,
    );
    expect(serviceProductQueryAfterStage2.findMany().sync()).toEqual(
      serviceProductsBefore2,
    );

    // 7 — remove only the first Provider pair while keeping its Config mounted.
    // The Config-owned worker capabilities and sockets remain alive. Remounting
    // creates fresh main-thread databases, hydrates them behind a current worker
    // snapshot, and rejoins the existing replica without a second acquisition.
    await act(async () => {
      root1.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: ReactAccount1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactService1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement('div', null, 'first Config retained'),
        }),
      );
      await Promise.resolve();
    });
    expect(accountRef1.current).toBeNull();
    expect(serviceRef1.current).toBeNull();
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
          );
          return {
            accountProviders: accountRows[0]?.activeProviderCount,
            accountSocket: accountRows[0]?.socketState,
            serviceProviders: serviceRows[0]?.activeProviderCount,
            serviceSocket: serviceRows[0]?.socketState,
          };
        },
        { interval: 50, timeout: 30_000 },
      )
      .toEqual({
        accountProviders: 2,
        accountSocket: 'online',
        serviceProviders: 2,
        serviceSocket: 'online',
      });

    await act(async () => {
      root1.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: ReactAccount1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactService1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(ReactAccount1.Provider, {
            ref: accountRef1,
            children: createElement(ReactService1.Provider, {
              ref: serviceRef1,
              children: createElement('div', null, 'first Config remounted'),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          accountRef1.current?.session.store.getState().isInitialized ?? false,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          serviceRef1.current?.session.store.getState().isInitialized ?? false,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(true);
    const remountedAccountState = accountRef1.current?.session.store.getState();
    const remountedServiceState = serviceRef1.current?.session.store.getState();
    if (
      remountedAccountState === undefined ||
      !remountedAccountState.isInitialized ||
      remountedServiceState === undefined ||
      !remountedServiceState.isInitialized
    ) {
      throw new Error('Remounted Provider sessions must initialize');
    }
    expect(remountedAccountState.db).not.toBe(accountState1.db);
    expect(remountedServiceState.db).not.toBe(serviceState1.db);
    expect(remountedAccountState.workerState.databaseName).toBe(
      accountRowBeforeStage.databaseName,
    );
    expect(remountedServiceState.workerState.databaseName).toBe(
      serviceRowBeforeStage.databaseName,
    );
    const remountedUserQuery = remountedAccountState.db.query.user;
    if (remountedUserQuery === undefined) {
      throw new Error('Remounted account User query must be present');
    }
    expect(
      remountedUserQuery
        .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
        .sync()?.name,
    ).toBe(updatedName);

    // 8 — Config teardown removes worker providers, closes sockets, and
    // retains both VFS names plus their bytes for later acquisition.
    await act(async () => {
      root1.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(root1);

    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(root => root.partitionKey === partitionKey).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(1);
    const remainingDiagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === partitionKey);
    if (remainingDiagnosticRoot === undefined) {
      throw new Error('Expected the second Config diagnostic root');
    }
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(
              await remainingDiagnosticRoot.listAccountFrontendReplicas(),
            ),
          );
          return rows[0]?.activeProviderCount;
        },
        { interval: 50, timeout: 30_000 },
      )
      .toBe(1);

    await act(async () => {
      root2.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(root2);

    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(root => root.partitionKey === partitionKey).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);

    const retainedWorkerSession = await Effect.runPromise(
      makeSharedWorkerSession({
        systemId: accountState1.systemId,
        generationId: accountState1.generationId,
        apiUrl,
        publishableKey,
      }),
    );
    const retainedPartitionApi =
      await retainedWorkerSession.api.getPartitionApi({ partitionKey });
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(await retainedPartitionApi.listAccountFrontendReplicas()),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(await retainedPartitionApi.listServiceFrontendReplicas()),
          );
          return {
            accountDatabaseName: accountRows[0]?.databaseName,
            accountProviders: accountRows[0]?.activeProviderCount,
            accountSocket: accountRows[0]?.socketState,
            serviceDatabaseName: serviceRows[0]?.databaseName,
            serviceProviders: serviceRows[0]?.activeProviderCount,
            serviceSocket: serviceRows[0]?.socketState,
          };
        },
        { interval: 50, timeout: 30_000 },
      )
      .toEqual({
        accountDatabaseName: accountRowBeforeStage.databaseName,
        accountProviders: 0,
        accountSocket: 'disconnected',
        serviceDatabaseName: serviceRowBeforeStage.databaseName,
        serviceProviders: 0,
        serviceSocket: 'disconnected',
      });
    await Effect.runPromise(retainedWorkerSession.release);

    // 9 — fail only the main-thread admission transport. The SharedWorker has
    // its own realm, so its IndexedDB remains available and both exact cached
    // locators can hydrate without constructing a live admission capability.
    const webSocketSpy = vi
      .spyOn(globalThis, 'WebSocket')
      .mockImplementation(function () {
        throw new DOMException(
          'Intentional browser admission transport outage',
          'NetworkError',
        );
      });

    const offlineContainer = document.createElement('div');
    document.body.appendChild(offlineContainer);
    mountedContainers.add(offlineContainer);
    const offlineRoot = createRoot(offlineContainer);
    mountedRoots.add(offlineRoot);
    const offlineAccountRef =
      createRef<ComponentRef<typeof ReactAccount1.Provider>>();
    const offlineServiceRef =
      createRef<ComponentRef<typeof ReactService1.Provider>>();

    await act(async () => {
      offlineRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: ReactAccount1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactService1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(ReactAccount1.Provider, {
            ref: offlineAccountRef,
            children: createElement(ReactService1.Provider, {
              ref: offlineServiceRef,
              children: createElement('div', null, 'cached Config ready'),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () =>
          offlineAccountRef.current?.session.store.getState().isInitialized ??
          false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          offlineServiceRef.current?.session.store.getState().isInitialized ??
          false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    const offlineAccountState =
      offlineAccountRef.current?.session.store.getState();
    const offlineServiceState =
      offlineServiceRef.current?.session.store.getState();
    if (
      offlineAccountState === undefined ||
      !offlineAccountState.isInitialized ||
      offlineServiceState === undefined ||
      !offlineServiceState.isInitialized
    ) {
      throw new Error('Cached account and service sessions must initialize');
    }
    expect(offlineAccountState.workerState).toMatchObject({
      mode: 'shared-worker',
      status: 'offline',
      bootstrapSource: 'replica',
    });
    expect(offlineServiceState.workerState).toMatchObject({
      mode: 'shared-worker',
      status: 'offline',
      bootstrapSource: 'replica',
    });
    expect(offlineAccountState.workerState.databaseName).toBe(
      accountRowBeforeStage.databaseName,
    );
    expect(offlineServiceState.workerState.databaseName).toBe(
      serviceRowBeforeStage.databaseName,
    );
    const offlineAccountUserQuery = offlineAccountState.db.query.user;
    const offlineServiceProductQuery = offlineServiceState.db.query.product;
    if (
      offlineAccountUserQuery === undefined ||
      offlineServiceProductQuery === undefined
    ) {
      throw new Error('Cached resource queries must be present');
    }
    expect(
      offlineAccountUserQuery
        .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
        .sync()?.name,
    ).toBe(updatedName);
    expect(offlineServiceProductQuery.findMany().sync()).toEqual(
      serviceProductsBefore1,
    );

    const offlineDiagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === partitionKey);
    if (offlineDiagnosticRoot === undefined) {
      throw new Error('Expected the cached Config diagnostic root');
    }
    const offlineAccountRows = await Effect.runPromise(
      decodeRpc(await offlineDiagnosticRoot.listAccountFrontendReplicas()),
    );
    const offlineServiceRows = await Effect.runPromise(
      decodeRpc(await offlineDiagnosticRoot.listServiceFrontendReplicas()),
    );
    expect(offlineAccountRows).toEqual([
      expect.objectContaining({
        activeProviderCount: 1,
        databaseName: accountRowBeforeStage.databaseName,
        socketState: 'disconnected',
      }),
    ]);
    expect(offlineServiceRows).toEqual([
      expect.objectContaining({
        activeProviderCount: 1,
        databaseName: serviceRowBeforeStage.databaseName,
        socketState: 'disconnected',
      }),
    ]);

    const offlineAccountSession = offlineAccountRef.current?.session;
    if (offlineAccountSession === undefined) {
      throw new Error('Cached account session must be mounted before staging');
    }
    const offlineUpdatedName = `Offline durable ${testRunId}`;
    const offlineStaged = await offlineAccountSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: offlineUpdatedName,
      },
    });
    expect(offlineStaged._tag).toBe('Right');
    if (offlineStaged._tag === 'Left') {
      throw new Error(offlineStaged.left.message);
    }
    const offlineCommandId = offlineStaged.right.id;
    await expect
      .poll(
        () => {
          const currentState = offlineAccountSession.store.getState();
          if (!currentState.isInitialized) {
            return null;
          }
          const userQuery = currentState.db.query.user;
          if (userQuery === undefined) {
            return null;
          }
          return {
            name: userQuery
              .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
              .sync()?.name,
            stagedIds: currentState.db
              .select()
              .from(sessionStagedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            status: currentState.workerState.status,
          };
        },
        { interval: 50, timeout: 30_000 },
      )
      .toEqual({
        name: offlineUpdatedName,
        stagedIds: expect.arrayContaining([offlineCommandId]),
        status: 'offline',
      });

    // Close the only Config while transport is still unavailable. The worker
    // must retain the journal row and its optimistic materialization with no
    // provider, socket, reconnect, or mounted main-thread database.
    await act(async () => {
      offlineRoot.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(offlineRoot);
    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(root => root.partitionKey === partitionKey).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);

    const refreshedContainer = document.createElement('div');
    document.body.appendChild(refreshedContainer);
    mountedContainers.add(refreshedContainer);
    const refreshedRoot = createRoot(refreshedContainer);
    mountedRoots.add(refreshedRoot);
    const refreshedAccountRef =
      createRef<ComponentRef<typeof ReactAccount1.Provider>>();
    const refreshedServiceRef =
      createRef<ComponentRef<typeof ReactService1.Provider>>();

    await act(async () => {
      refreshedRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: ReactAccount1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactService1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(ReactAccount1.Provider, {
            ref: refreshedAccountRef,
            children: createElement(ReactService1.Provider, {
              ref: refreshedServiceRef,
              children: createElement('div', null, 'offline refresh ready'),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          refreshedAccountRef.current?.session.store.getState().isInitialized ??
          false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          refreshedServiceRef.current?.session.store.getState().isInitialized ??
          false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const refreshedOfflineAccountState =
      refreshedAccountRef.current?.session.store.getState();
    if (
      refreshedOfflineAccountState === undefined ||
      !refreshedOfflineAccountState.isInitialized
    ) {
      throw new Error('Refreshed cached account session must initialize');
    }
    const refreshedOfflineUserQuery =
      refreshedOfflineAccountState.db.query.user;
    if (refreshedOfflineUserQuery === undefined) {
      throw new Error('Refreshed cached User query must be present');
    }
    expect(
      refreshedOfflineUserQuery
        .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
        .sync()?.name,
    ).toBe(offlineUpdatedName);
    expect(
      refreshedOfflineAccountState.db
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .all()
        .map(command => command.id),
    ).toContain(offlineCommandId);
    expect(refreshedOfflineAccountState.workerState).toMatchObject({
      status: 'offline',
      databaseName: accountRowBeforeStage.databaseName,
    });

    const refreshedDiagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === partitionKey);
    if (refreshedDiagnosticRoot === undefined) {
      throw new Error('Expected the refreshed cached Config diagnostic root');
    }
    webSocketSpy.mockRestore();
    globalThis.dispatchEvent(new Event('online'));
    await expect
      .poll(
        () => {
          const currentAccountState =
            refreshedAccountRef.current?.session.store.getState();
          const currentServiceState =
            refreshedServiceRef.current?.session.store.getState();
          if (
            currentAccountState === undefined ||
            !currentAccountState.isInitialized ||
            currentServiceState === undefined ||
            !currentServiceState.isInitialized
          ) {
            return null;
          }
          return {
            accountStatus: currentAccountState.workerState.status,
            accountDatabaseName: currentAccountState.workerState.databaseName,
            serviceStatus: currentServiceState.workerState.status,
            serviceDatabaseName: currentServiceState.workerState.databaseName,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        accountStatus: 'online',
        accountDatabaseName: accountRowBeforeStage.databaseName,
        serviceStatus: 'online',
        serviceDatabaseName: serviceRowBeforeStage.databaseName,
      });
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(
              await refreshedDiagnosticRoot.listAccountFrontendReplicas(),
            ),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(
              await refreshedDiagnosticRoot.listServiceFrontendReplicas(),
            ),
          );
          return {
            accountProviders: accountRows[0]?.activeProviderCount,
            accountSocket: accountRows[0]?.socketState,
            serviceProviders: serviceRows[0]?.activeProviderCount,
            serviceSocket: serviceRows[0]?.socketState,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        accountProviders: 1,
        accountSocket: 'online',
        serviceProviders: 1,
        serviceSocket: 'online',
      });

    await expect
      .poll(
        () => {
          const currentState =
            refreshedAccountRef.current?.session.store.getState();
          if (currentState === undefined || !currentState.isInitialized) {
            return null;
          }
          const userQuery = currentState.db.query.user;
          if (userQuery === undefined) {
            return null;
          }
          return {
            executedIds: currentState.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            name: userQuery
              .findFirst({ where: { id: { eq: User.prefixId(clerkUserId) } } })
              .sync()?.name,
            pushedIds: currentState.db
              .select()
              .from(sessionPushedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            stagedIds: currentState.db
              .select()
              .from(sessionStagedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        executedIds: expect.arrayContaining([offlineCommandId]),
        name: offlineUpdatedName,
        pushedIds: expect.not.arrayContaining([offlineCommandId]),
        stagedIds: expect.not.arrayContaining([offlineCommandId]),
      });

    await act(async () => {
      refreshedRoot.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(refreshedRoot);
    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(root => root.partitionKey === partitionKey).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);

    // 10 — the exact cached row now exists, but a schema-invalid signature is
    // a domain failure. Bootstrap must stop before opening a worker root rather
    // than disguising the rejection as an offline transport failure.
    expect(
      globalThis.localStorage.getItem(
        `zerospin:frontend-locators:${partitionKey}`,
      ),
    ).not.toBeNull();
    const invalidController = makeBrowserPartitionController({
      partitionKey,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: frontendName => {
        if (frontendName !== shopperFrontend.frontendName) {
          return undefined;
        }
        return {
          frontend: ReactAccount1,
          generateSignature: () => Effect.succeed({ clerkUserId: 42 }),
        };
      },
    });
    const invalidSessionId = testRuntime.runSync(
      makeIdFromAbbreviation({ abbreviation: coreAbbreviations.session }),
    );
    const invalidSession = makeSession({
      frontend: shopperFrontend,
      generateSignature: () => Effect.succeed({ clerkUserId }),
      sessionId: invalidSessionId,
      isSharedWorkerEnabled: true,
      runtime: testRuntime,
    });
    const invalidBootstrap = await testRuntime.runPromise(
      bootstrapBrowserSession({
        session: invalidSession,
        browserPartitionController: invalidController,
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(
            invalidSession.store.getState().telemetryCollector,
          ),
        ),
        Effect.either,
      ),
    );
    expect(Either.isLeft(invalidBootstrap)).toBe(true);
    if (Either.isLeft(invalidBootstrap)) {
      expect(invalidBootstrap.left.code).toBe('frontend-signature-invalid');
    }
    expect(invalidController.store.getState().workerRootCount).toBe(0);
    const locatorsAfterInvalidSignature = globalThis.localStorage.getItem(
      `zerospin:frontend-locators:${partitionKey}`,
    );
    expect(locatorsAfterInvalidSignature).not.toBeNull();
    expect(locatorsAfterInvalidSignature).not.toContain('"kind":"account"');
    expect(locatorsAfterInvalidSignature).toContain('"kind":"service"');
    await invalidController.release();
  }, 300_000);
});
