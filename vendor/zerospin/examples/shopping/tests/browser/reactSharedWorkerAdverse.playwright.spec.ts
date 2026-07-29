/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, createRef, type ComponentRef } from 'react';

import type {} from '@vitest/browser-playwright';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSession } from '@zerospin/core/session/makeSession';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import { createFrontendWebSocketTicket } from '@zerospin/frontend/createFrontendWebSocketTicket';
import { fetchFrontendState } from '@zerospin/frontend/fetchFrontendState';
import { pushFrontendCommands } from '@zerospin/frontend/pushFrontendCommands';
import { makeTelemetryLayer } from '@zerospin/logger';
import { bootstrapBrowserSession } from '@zerospin/react/bootstrapBrowserSession';
import { makeBrowserPartitionController } from '@zerospin/react/makeBrowserPartitionController';
import { makeReactFrontend } from '@zerospin/react/makeReactFrontend';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { eq, sql } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';

vi.mock(import('@zerospin/frontend/createFrontendWebSocketTicket'), {
  spy: true,
});
vi.mock(import('@zerospin/frontend/fetchFrontendState'), { spy: true });
vi.mock(import('@zerospin/frontend/pushFrontendCommands'), { spy: true });

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const apiUrl = 'http://127.0.0.1:3035/';
const publishableKey = 'pk_test';
const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

const adverseRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('reactSharedWorkerAdverse'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApisUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
);

const AdverseAccount = makeReactFrontend({
  frontend: shopperFrontend,
  runtime: adverseRuntime,
});

const AdverseAccountSibling = makeReactFrontend({
  frontend: shopperFrontend,
  runtime: adverseRuntime,
});

const shopperFrontendPreviousVersion = makeFrontendController({
  contracts: shopperFrontend.contracts,
  accountName: shopperFrontend.accountName,
  actorName: shopperFrontend.actorName,
  frontendName: shopperFrontend.frontendName,
  version: '0.9.0',
  systemName: shopperFrontend.systemName,
  models: shopperFrontend.models,
  signature: shopperFrontend.signature,
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await adverseRuntime.dispose();
});

describe('React SharedWorker adverse acceptance', () => {
  it('authenticates before exposure and reuses an exact ready replica without requesting full state', async () => {
    /*
     * 1. Create one ready replica through the real Shopping admission/state/socket path.
     * 2. Release the complete Config while retaining its catalog and VFS bytes.
     * 3. Mount a new Config whose real signature is deliberately gated.
     * 4. Prove no initialized database or cached row is exposed before auth completes.
     * 5. Release auth and prove the exact database is reused with zero full-state calls.
     * 6. Expire the persisted locator and prove strict cache lookup removes/refuses it.
     */
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('/__zerospin/ready')).status;
          } catch {
            return 0;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(204);

    const partitionKey = `adverse-auth-${testRunId}`;
    const clerkUserId = `adverse-auth-user-${testRunId}`;
    const firstContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);
    const firstRef = createRef<ComponentRef<typeof AdverseAccount.Provider>>();

    await act(async () => {
      firstRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccount,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(AdverseAccount.Provider, {
            ref: firstRef,
            children: createElement('div', null, 'first replica ready'),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () => firstRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    expect(vi.mocked(fetchFrontendState)).toHaveBeenCalled();
    const firstState = firstRef.current?.session.store.getState();
    if (firstState === undefined || !firstState.isInitialized) {
      throw new Error('The first account Provider must initialize');
    }
    const retainedDatabaseName = firstState.workerState.databaseName;
    const retainedReplicaIndex = firstState.replicaIndex;
    expect(retainedDatabaseName).not.toBeNull();
    expect(retainedReplicaIndex).not.toBeNull();

    await act(async () => {
      firstRoot.unmount();
      await Promise.resolve();
    });
    firstContainer.remove();
    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(root => root.partitionKey === partitionKey).length,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(0);

    vi.mocked(fetchFrontendState).mockClear();
    const authentication = Promise.withResolvers<{
      clerkUserId: string;
    }>();
    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    const secondRef = createRef<ComponentRef<typeof AdverseAccount.Provider>>();

    await act(async () => {
      secondRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccount,
              generateSignature: () =>
                Effect.promise(() => authentication.promise),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(AdverseAccount.Provider, {
            ref: secondRef,
            children: createElement('div', null, 'gated replica'),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(() => secondRef.current !== null, {
        interval: 25,
        timeout: 30_000,
      })
      .toBe(true);
    expect(secondRef.current?.session.store.getState()).toMatchObject({
      isInitialized: false,
      db: null,
      actorId: null,
      workerState: {
        status: 'authenticating',
        bootstrapSource: null,
        databaseName: null,
      },
    });
    expect(vi.mocked(fetchFrontendState)).not.toHaveBeenCalled();

    await act(async () => {
      authentication.resolve({ clerkUserId });
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          secondRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    const secondState = secondRef.current?.session.store.getState();
    if (secondState === undefined || !secondState.isInitialized) {
      throw new Error('The gated account Provider must initialize');
    }
    expect(secondState.workerState).toMatchObject({
      mode: 'shared-worker',
      status: 'online',
      bootstrapSource: 'replica',
      databaseName: retainedDatabaseName,
    });
    expect(secondState.replicaIndex).toBe(retainedReplicaIndex);
    expect(vi.mocked(fetchFrontendState)).not.toHaveBeenCalled();

    await act(async () => {
      secondRoot.unmount();
      await Promise.resolve();
    });
    secondContainer.remove();

    const locatorKey = `zerospin:frontend-locators:${partitionKey}`;
    const encodedLocatorStore = globalThis.localStorage.getItem(locatorKey);
    if (encodedLocatorStore === null) {
      throw new Error('Online authentication must persist an account locator');
    }
    const expiredLocatorStore = JSON.parse(encodedLocatorStore);
    const expiredLocator = Object.values(expiredLocatorStore.state.locators)[0];
    if (
      typeof expiredLocator !== 'object' ||
      expiredLocator === null ||
      !('authenticatedAt' in expiredLocator)
    ) {
      throw new Error('Persisted locator must have an authentication time');
    }
    const authenticatedAt = Reflect.get(expiredLocator, 'authenticatedAt');
    if (typeof authenticatedAt !== 'number') {
      throw new Error('Persisted authentication time must be numeric');
    }
    Reflect.set(expiredLocator, 'expiresAt', authenticatedAt - 1);
    globalThis.localStorage.setItem(
      locatorKey,
      JSON.stringify(expiredLocatorStore),
    );

    const expiredController = makeBrowserPartitionController({
      partitionKey,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: frontendName => {
        if (frontendName !== shopperFrontend.frontendName) {
          return undefined;
        }
        return {
          frontend: AdverseAccount,
          generateSignature: () => Effect.succeed({ clerkUserId }),
        };
      },
    });
    expect(
      expiredController.getCachedAccountFrontendLocator({
        apiUrl,
        publishableKey,
        frontend: shopperFrontend,
        role: 'active',
      }),
    ).toBeNull();
    expect(globalThis.localStorage.getItem(locatorKey)).not.toContain(
      clerkUserId,
    );
    await expiredController.release();
  }, 300_000);

  it('authenticates a changed actor before hydration, revokes the old session, and preserves its complete replica state', async () => {
    /*
     * 1. Bootstrap a real main-thread session through one explicit Config controller.
     * 2. Commit one command to give the old VFS and journal observable terminal bytes.
     * 3. Seed active/commissioned locators for both current and older versions.
     * 4. Gate a second real authentication and prove its session exposes no old target.
     * 5. Admit a different actor through the same controller and hydrate only that actor.
     * 6. Prove every old locator is gone and the old main-thread database was closed.
     * 7. Reopen the retained old worker replica offline and verify its resource/terminal bytes.
     */
    const partitionKey = `adverse-target-${testRunId}`;
    const oldClerkUserId = `adverse-old-user-${testRunId}`;
    const newClerkUserId = `adverse-new-user-${testRunId}`;
    let generateSignature = () =>
      Effect.succeed({
        clerkUserId: oldClerkUserId,
      });
    const controller = makeBrowserPartitionController({
      partitionKey,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: frontendName => {
        if (frontendName !== shopperFrontend.frontendName) {
          return undefined;
        }
        return {
          frontend: AdverseAccount,
          generateSignature: () => generateSignature(),
        };
      },
    });
    const oldSessionId = adverseRuntime.runSync(
      makeIdFromAbbreviation({ abbreviation: coreAbbreviations.session }),
    );
    const oldSession = makeSession({
      frontend: shopperFrontend,
      generateSignature: () => Effect.succeed({ clerkUserId: oldClerkUserId }),
      sessionId: oldSessionId,
      isSharedWorkerEnabled: true,
      runtime: adverseRuntime,
      stageFrontendCommand: props =>
        controller.stageAccountFrontendCommand({
          sessionId: oldSessionId,
          ...props,
        }),
    });
    const oldBrowserSession = await adverseRuntime.runPromise(
      bootstrapBrowserSession({
        session: oldSession,
        browserPartitionController: controller,
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(oldSession.store.getState().telemetryCollector),
        ),
      ),
    );
    const oldState = oldSession.store.getState();
    if (!oldState.isInitialized) {
      throw new Error('The original browser session must initialize');
    }
    const oldDatabase = oldState.db;
    const oldDatabaseName = oldState.workerState.databaseName;
    if (oldDatabaseName === null) {
      throw new Error('The original SharedWorker database name is required');
    }

    const preservedName = `Preserved old target ${testRunId}`;
    const staged = await oldSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(oldClerkUserId),
        name: preservedName,
      },
    });
    expect(staged._tag).toBe('Right');
    if (staged._tag === 'Left') {
      throw new Error(staged.left.message);
    }
    const preservedCommandId = staged.right.id;
    await expect
      .poll(
        () => {
          const state = oldSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return state.db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .all()
            .find(command => command.id === preservedCommandId)?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(preservedCommandId);

    controller.setCachedAccountFrontendLocator({
      apiUrl,
      publishableKey,
      frontend: shopperFrontend,
      role: 'commissioned',
      identity: {
        systemName: shopperFrontend.systemName,
        accountName: oldState.accountName,
        accountId: oldState.accountId,
        actorName:
          oldState.frontendName === null ? '' : shopperFrontend.actorName,
        actorId: oldState.actorId,
        frontendName: shopperFrontend.frontendName,
        frontendVersion: shopperFrontend.version,
        systemId: oldState.systemId,
        generationId: oldState.generationId,
        systemVersion: oldState.systemVersion,
        systemWorkerName: oldState.systemWorkerName,
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl,
      publishableKey,
      frontend: shopperFrontendPreviousVersion,
      role: 'active',
      identity: {
        systemName: shopperFrontendPreviousVersion.systemName,
        accountName: oldState.accountName,
        accountId: oldState.accountId,
        actorName: shopperFrontendPreviousVersion.actorName,
        actorId: oldState.actorId,
        frontendName: shopperFrontendPreviousVersion.frontendName,
        frontendVersion: shopperFrontendPreviousVersion.version,
        systemId: oldState.systemId,
        generationId: oldState.generationId,
        systemVersion: oldState.systemVersion,
        systemWorkerName: oldState.systemWorkerName,
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl,
      publishableKey,
      frontend: shopperFrontendPreviousVersion,
      role: 'commissioned',
      identity: {
        systemName: shopperFrontendPreviousVersion.systemName,
        accountName: oldState.accountName,
        accountId: oldState.accountId,
        actorName: shopperFrontendPreviousVersion.actorName,
        actorId: oldState.actorId,
        frontendName: shopperFrontendPreviousVersion.frontendName,
        frontendVersion: shopperFrontendPreviousVersion.version,
        systemId: oldState.systemId,
        generationId: oldState.generationId,
        systemVersion: oldState.systemVersion,
        systemWorkerName: oldState.systemWorkerName,
      },
    });

    const nextAuthentication = Promise.withResolvers<{
      clerkUserId: string;
    }>();
    generateSignature = () => Effect.promise(() => nextAuthentication.promise);
    const nextSessionId = adverseRuntime.runSync(
      makeIdFromAbbreviation({ abbreviation: coreAbbreviations.session }),
    );
    const nextSession = makeSession({
      frontend: shopperFrontend,
      generateSignature: () => Effect.succeed({ clerkUserId: newClerkUserId }),
      sessionId: nextSessionId,
      isSharedWorkerEnabled: true,
      runtime: adverseRuntime,
      stageFrontendCommand: props =>
        controller.stageAccountFrontendCommand({
          sessionId: nextSessionId,
          ...props,
        }),
    });
    const observedActorIds: string[] = [];
    const unsubscribeFromNextSession = nextSession.store.subscribe(
      (state, previousState) => {
        if (state.isInitialized && state.actorId !== previousState.actorId) {
          observedActorIds.push(state.actorId);
        }
      },
    );
    const nextBrowserSessionPromise = adverseRuntime.runPromise(
      bootstrapBrowserSession({
        session: nextSession,
        browserPartitionController: controller,
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(nextSession.store.getState().telemetryCollector),
        ),
      ),
    );
    await Promise.resolve();
    expect(nextSession.store.getState()).toMatchObject({
      isInitialized: false,
      actorId: null,
      db: null,
      workerState: { status: 'authenticating' },
    });

    nextAuthentication.resolve({ clerkUserId: newClerkUserId });
    const nextBrowserSession = await nextBrowserSessionPromise;
    const nextState = nextSession.store.getState();
    if (!nextState.isInitialized) {
      throw new Error('The replacement browser session must initialize');
    }
    expect(observedActorIds).toEqual([nextState.actorId]);
    expect(nextState.actorId).not.toBe(oldState.actorId);
    expect(nextState.workerState.databaseName).not.toBe(oldDatabaseName);
    unsubscribeFromNextSession();

    const locatorBytes = globalThis.localStorage.getItem(
      `zerospin:frontend-locators:${partitionKey}`,
    );
    expect(locatorBytes).not.toBeNull();
    expect(locatorBytes).not.toContain(oldState.actorId);
    expect(locatorBytes).not.toContain(shopperFrontendPreviousVersion.version);
    expect(locatorBytes).toContain(nextState.actorId);
    expect(() =>
      oldDatabase.query.user
        ?.findFirst({
          where: { id: { eq: User.prefixId(oldClerkUserId) } },
        })
        .sync(),
    ).toThrow();

    const diagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === partitionKey);
    if (diagnosticRoot === undefined) {
      throw new Error('The replacement Config must retain a diagnostic root');
    }
    const accountRows = await adverseRuntime.runPromise(
      decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
    );
    expect(accountRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: oldState.actorId,
          databaseName: oldDatabaseName,
          activeProviderCount: 0,
        }),
        expect.objectContaining({
          actorId: nextState.actorId,
          databaseName: nextState.workerState.databaseName,
          activeProviderCount: 1,
        }),
      ]),
    );

    await adverseRuntime.runPromise(nextBrowserSession.releaseBrowserSession);
    await controller.release();

    let preservedStateObserved = false;
    let preservedDatabaseObserved: string | null = null;
    const preservedController = makeBrowserPartitionController({
      partitionKey,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: frontendName => {
        if (frontendName !== shopperFrontend.frontendName) {
          return undefined;
        }
        return {
          frontend: AdverseAccount,
          generateSignature: () =>
            Effect.succeed({ clerkUserId: oldClerkUserId }),
        };
      },
    });
    const preservedAcquisition = await adverseRuntime.runPromise(
      preservedController.acquireAccountFrontendReplica({
        frontend: shopperFrontend,
        apiUrl,
        publishableKey,
        systemId: oldState.systemId,
        generationId: oldState.generationId,
        systemVersion: oldState.systemVersion,
        accountId: oldState.accountId,
        accountName: oldState.accountName,
        actorId: oldState.actorId,
        actorName: shopperFrontend.actorName,
        frontendName: shopperFrontend.frontendName,
        frontendVersion: shopperFrontend.version,
        frontendSpec: makeFrontendControllerSpec(shopperFrontend),
        frontendSpecHash: await adverseRuntime.runPromise(
          makeFrontendSpecHash(makeFrontendControllerSpec(shopperFrontend)),
        ),
        authority: 'cached-offline',
        role: 'active',
        commissionOwnerId: null,
        network: null,
        transportRegain: null,
      }),
    );
    const preservedHydration = await adverseRuntime.runPromise(
      preservedAcquisition.hydrateSession({
        sessionId: adverseRuntime.runSync(
          makeIdFromAbbreviation({ abbreviation: coreAbbreviations.session }),
        ),
        replaceFrontendState: async frontendReplicaState => {
          const retainedResourceBytes = JSON.stringify(
            frontendReplicaState.resources,
          );
          const retainedTerminalJournalBytes = JSON.stringify(
            frontendReplicaState.executedPushedCommands,
          );
          expect(retainedResourceBytes).toContain(preservedName);
          expect(retainedTerminalJournalBytes).toContain(preservedCommandId);
          expect(frontendReplicaState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: User.prefixId(oldClerkUserId),
                name: preservedName,
              }),
            ]),
          );
          expect(frontendReplicaState.executedPushedCommands).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: preservedCommandId }),
            ]),
          );
          preservedStateObserved = true;
        },
        handleFrontendReplicaBlock: async () => {
          throw new Error(
            'Retained offline state must not receive live blocks',
          );
        },
        setDatabaseName: databaseName => {
          preservedDatabaseObserved = databaseName;
        },
        setOnline: () => undefined,
        setRepairing: () => {
          throw new Error('Retained healthy state must not enter repair');
        },
        setUpdateRequired: () => {
          throw new Error('Retained matching state must not require an update');
        },
        setFailure: error => {
          throw error;
        },
        teardown: async () => undefined,
      }),
    );
    expect(preservedStateObserved).toBe(true);
    expect(preservedDatabaseObserved).toBe(oldDatabaseName);
    await adverseRuntime.runPromise(preservedHydration.release);
    await preservedController.release();
    await adverseRuntime
      .runPromise(oldBrowserSession.releaseBrowserSession)
      .catch(() => undefined);
  }, 300_000);

  it('hydrates a second database before callbacks, refreshes once per transaction, and repairs it without poisoning its sibling', async () => {
    /*
     * 1. Mount one real Config/Provider and settle an authoritative command.
     * 2. Mount a second Config/Provider against the same SharedWorker replica.
     * 3. Prove the second main-thread database hydrates the settled snapshot.
     * 4. Commit another command and count one database notification per block transaction.
     * 5. Install a real SQLite trigger that rejects one update only in the second database.
     * 6. Stage that update, observe second-session repair, and stage a concurrent update.
     * 7. Prove the healthy sibling never repairs and the repaired database catches up once.
     */
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('/__zerospin/ready')).status;
          } catch {
            return 0;
          }
        },
        { interval: 500, timeout: 120_000 },
      )
      .toBe(204);

    const partitionKey = `adverse-repair-${testRunId}`;
    const clerkUserId = `adverse-repair-user-${testRunId}`;
    const firstContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);
    const firstRef = createRef<ComponentRef<typeof AdverseAccount.Provider>>();

    await act(async () => {
      firstRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccount,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(AdverseAccount.Provider, {
            ref: firstRef,
            children: createElement('div', null, 'healthy main-thread replica'),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () => firstRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const firstSession = firstRef.current?.session;
    if (firstSession === undefined) {
      throw new Error('The first account Provider must expose its session');
    }

    const snapshotName = `Snapshot before sibling hydration ${testRunId}`;
    const snapshotCommand = await firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: snapshotName,
      },
    });
    expect(snapshotCommand._tag).toBe('Right');
    if (snapshotCommand._tag === 'Left') {
      throw new Error(snapshotCommand.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return state.db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(
                sessionExecutedPushedCommandDrizzleSchema.id,
                snapshotCommand.right.id,
              ),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(snapshotCommand.right.id);

    const secondContainer = document.createElement('div');
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    const secondRef =
      createRef<ComponentRef<typeof AdverseAccountSibling.Provider>>();

    await act(async () => {
      secondRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccountSibling,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(AdverseAccountSibling.Provider, {
            ref: secondRef,
            children: createElement(
              'div',
              null,
              'repairable main-thread replica',
            ),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () =>
          secondRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const secondSession = secondRef.current?.session;
    if (secondSession === undefined) {
      throw new Error('The second account Provider must expose its session');
    }
    const firstSnapshotState = firstSession.store.getState();
    const secondSnapshotState = secondSession.store.getState();
    if (
      !firstSnapshotState.isInitialized ||
      !secondSnapshotState.isInitialized
    ) {
      throw new Error('Both real main-thread databases must be initialized');
    }
    const secondDatabaseIdentity = secondSnapshotState.db;
    expect(secondSnapshotState.db).not.toBe(firstSnapshotState.db);
    expect(secondSnapshotState.workerState.databaseName).toBe(
      firstSnapshotState.workerState.databaseName,
    );
    expect(secondSnapshotState.replicaIndex).toBe(
      firstSnapshotState.replicaIndex,
    );
    expect(
      secondSnapshotState.db.query.user
        ?.findFirst({
          where: { id: { eq: User.prefixId(clerkUserId) } },
        })
        .sync()?.name,
    ).toBe(snapshotName);
    expect(
      secondSnapshotState.db
        .select()
        .from(sessionExecutedPushedCommandDrizzleSchema)
        .where(
          eq(
            sessionExecutedPushedCommandDrizzleSchema.id,
            snapshotCommand.right.id,
          ),
        )
        .get()?.id,
    ).toBe(snapshotCommand.right.id);

    let firstTransactionNotificationCount = 0;
    let secondTransactionNotificationCount = 0;
    const unsubscribeFirstDatabaseNotifications =
      firstSnapshotState.db.$client.subscribeToTableChanges(() => {
        firstTransactionNotificationCount += 1;
      });
    const unsubscribeSecondDatabaseNotifications =
      secondSnapshotState.db.$client.subscribeToTableChanges(() => {
        secondTransactionNotificationCount += 1;
      });
    const firstReplicaIndexBeforeRefresh = firstSnapshotState.replicaIndex;
    const secondReplicaIndexBeforeRefresh = secondSnapshotState.replicaIndex;
    if (
      firstReplicaIndexBeforeRefresh === null ||
      secondReplicaIndexBeforeRefresh === null
    ) {
      throw new Error('Both replica indexes must exist before refresh');
    }

    const refreshedName = `Exactly one refresh ${testRunId}`;
    const refreshedCommand = await firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: refreshedName,
      },
    });
    expect(refreshedCommand._tag).toBe('Right');
    if (refreshedCommand._tag === 'Left') {
      throw new Error(refreshedCommand.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return state.db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(
                sessionExecutedPushedCommandDrizzleSchema.id,
                refreshedCommand.right.id,
              ),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(refreshedCommand.right.id);
    await expect
      .poll(
        () => {
          const state = secondSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return state.db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(
                sessionExecutedPushedCommandDrizzleSchema.id,
                refreshedCommand.right.id,
              ),
            )
            .get()?.id;
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(refreshedCommand.right.id);

    const firstStateAfterRefresh = firstSession.store.getState();
    const secondStateAfterRefresh = secondSession.store.getState();
    if (
      !firstStateAfterRefresh.isInitialized ||
      !secondStateAfterRefresh.isInitialized ||
      firstStateAfterRefresh.replicaIndex === null ||
      secondStateAfterRefresh.replicaIndex === null
    ) {
      throw new Error('Both replicas must remain initialized after refresh');
    }
    expect(firstTransactionNotificationCount).toBe(
      firstStateAfterRefresh.replicaIndex - firstReplicaIndexBeforeRefresh,
    );
    expect(secondTransactionNotificationCount).toBe(
      secondStateAfterRefresh.replicaIndex - secondReplicaIndexBeforeRefresh,
    );
    expect(secondTransactionNotificationCount).toBe(
      firstTransactionNotificationCount,
    );
    expect(
      secondStateAfterRefresh.db.query.user
        ?.findFirst({
          where: { id: { eq: User.prefixId(clerkUserId) } },
        })
        .sync()?.name,
    ).toBe(refreshedName);
    unsubscribeFirstDatabaseNotifications();
    unsubscribeSecondDatabaseNotifications();

    const failingName = `Repair trigger ${testRunId}`;
    secondStateAfterRefresh.db.run(
      sql.raw(`
        CREATE TRIGGER reject_adverse_repair_update
        BEFORE UPDATE ON "user"
        WHEN NEW.name = '${failingName}'
        BEGIN
          SELECT RAISE(ABORT, 'injected second-session update failure');
        END;
      `),
    );

    let firstRepairTransitionCount = 0;
    let secondRepairTransitionCount = 0;
    const secondRepairing = Promise.withResolvers<void>();
    const unsubscribeFirstSessionState = firstSession.store.subscribe(
      (state, previousState) => {
        if (
          state.workerState.status === 'repairing' &&
          previousState.workerState.status !== 'repairing'
        ) {
          firstRepairTransitionCount += 1;
        }
      },
    );
    const unsubscribeSecondSessionState = secondSession.store.subscribe(
      (state, previousState) => {
        if (
          state.workerState.status === 'repairing' &&
          previousState.workerState.status !== 'repairing'
        ) {
          secondRepairTransitionCount += 1;
          secondRepairing.resolve();
        }
      },
    );

    const failingCommandPromise = firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: failingName,
      },
    });
    await secondRepairing.promise;
    secondStateAfterRefresh.db.run(
      sql.raw('DROP TRIGGER IF EXISTS reject_adverse_repair_update'),
    );

    const concurrentName = `Concurrent during repair ${testRunId}`;
    const firstStateBeforeConcurrentCommand = firstSession.store.getState();
    if (
      !firstStateBeforeConcurrentCommand.isInitialized ||
      firstStateBeforeConcurrentCommand.replicaIndex === null
    ) {
      throw new Error('The healthy session must have a current replica index');
    }
    const replicaIndexBeforeConcurrentCommand =
      firstStateBeforeConcurrentCommand.replicaIndex;
    const firstConcurrentCommandPromise = firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: concurrentName,
      },
    });

    const failingCommand = await failingCommandPromise;
    expect(failingCommand._tag).toBe('Right');
    if (failingCommand._tag === 'Left') {
      throw new Error(failingCommand.left.message);
    }
    let concurrentCommand = await firstConcurrentCommandPromise;
    if (concurrentCommand._tag === 'Left') {
      expect(concurrentCommand.left.code).toBe(
        'account-frontend-replica-base-index-stale',
      );
      const firstStateBeforeSecondConcurrentCommand =
        firstSession.store.getState();
      if (
        !firstStateBeforeSecondConcurrentCommand.isInitialized ||
        firstStateBeforeSecondConcurrentCommand.replicaIndex === null
      ) {
        throw new Error(
          'The healthy session must consume the first missing replica block before recomputing the concurrent command',
        );
      }
      expect(firstStateBeforeSecondConcurrentCommand.replicaIndex).toBeGreaterThan(
        replicaIndexBeforeConcurrentCommand,
      );
      const replicaIndexBeforeSecondConcurrentCommand =
        firstStateBeforeSecondConcurrentCommand.replicaIndex;
      concurrentCommand = await firstSession.stageCommand({
        contractName: 'updateUser',
        payload: {
          id: User.prefixId(clerkUserId),
          name: concurrentName,
        },
      });
      if (concurrentCommand._tag === 'Left') {
        expect(concurrentCommand.left.code).toBe(
          'account-frontend-replica-base-index-stale',
        );
        const firstStateBeforeThirdConcurrentCommand =
          firstSession.store.getState();
        if (
          !firstStateBeforeThirdConcurrentCommand.isInitialized ||
          firstStateBeforeThirdConcurrentCommand.replicaIndex === null
        ) {
          throw new Error(
            'The healthy session must consume the second missing replica block before recomputing the concurrent command again',
          );
        }
        expect(
          firstStateBeforeThirdConcurrentCommand.replicaIndex,
        ).toBeGreaterThan(replicaIndexBeforeSecondConcurrentCommand);
        concurrentCommand = await firstSession.stageCommand({
          contractName: 'updateUser',
          payload: {
            id: User.prefixId(clerkUserId),
            name: concurrentName,
          },
        });
      }
    }
    if (concurrentCommand._tag === 'Left') {
      throw new Error(
        `${concurrentCommand.left.code}: ${concurrentCommand.left.message}`,
      );
    }
    expect(concurrentCommand._tag).toBe('Right');

    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return {
            concurrentCommandId: state.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .where(
                eq(
                  sessionExecutedPushedCommandDrizzleSchema.id,
                  concurrentCommand.right.id,
                ),
              )
              .get()?.id,
            name: state.db.query.user
              ?.findFirst({
                where: { id: { eq: User.prefixId(clerkUserId) } },
              })
              .sync()?.name,
            status: state.workerState.status,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        concurrentCommandId: concurrentCommand.right.id,
        name: concurrentName,
        status: 'online',
      });
    await expect
      .poll(
        () => {
          const state = secondSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return {
            concurrentCommandRows: state.db
              .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .where(
                eq(
                  sessionExecutedPushedCommandDrizzleSchema.id,
                  concurrentCommand.right.id,
                ),
              )
              .all(),
            failingCommandId: state.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .where(
                eq(
                  sessionExecutedPushedCommandDrizzleSchema.id,
                  failingCommand.right.id,
                ),
              )
              .get()?.id,
            name: state.db.query.user
              ?.findFirst({
                where: { id: { eq: User.prefixId(clerkUserId) } },
              })
              .sync()?.name,
            status: state.workerState.status,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        concurrentCommandRows: [{ id: concurrentCommand.right.id }],
        failingCommandId: failingCommand.right.id,
        name: concurrentName,
        status: 'online',
      });

    const finalFirstState = firstSession.store.getState();
    const finalSecondState = secondSession.store.getState();
    if (!finalFirstState.isInitialized || !finalSecondState.isInitialized) {
      throw new Error('Both sessions must remain initialized after repair');
    }
    expect(firstRepairTransitionCount).toBe(0);
    expect(secondRepairTransitionCount).toBe(1);
    expect(finalSecondState.db).toBe(secondDatabaseIdentity);
    expect(finalSecondState.replicaIndex).toBe(finalFirstState.replicaIndex);
    unsubscribeFirstSessionState();
    unsubscribeSecondSessionState();

    await act(async () => {
      secondRoot.unmount();
      firstRoot.unmount();
      await Promise.resolve();
    });
    secondContainer.remove();
    firstContainer.remove();
  }, 300_000);

  it('rolls back the losing optimistic cart after an authoritative unique-user rejection', async () => {
    /*
     * 1. Mount two independent SharedWorker partitions for the same real actor.
     * 2. Start one createCart command in each partition before either settles.
     * 3. Observe each worker-backed database materialize its own optimistic cart.
     * 4. Let the real account finalizer enforce Cart.userId uniqueness.
     * 5. Prove exactly one command executes and the other is terminally failed.
     * 6. Prove both replicas converge to the winner and remove every losing overlay.
     */
    const firstPartitionKey = `adverse-rejection-first-${testRunId}`;
    const secondPartitionKey = `adverse-rejection-second-${testRunId}`;
    const clerkUserId = `adverse-rejection-user-${testRunId}`;
    const userId = User.prefixId(clerkUserId);
    const firstContainer = document.createElement('div');
    const secondContainer = document.createElement('div');
    document.body.appendChild(firstContainer);
    document.body.appendChild(secondContainer);
    const firstRoot = createRoot(firstContainer);
    const secondRoot = createRoot(secondContainer);
    const firstRef = createRef<ComponentRef<typeof AdverseAccount.Provider>>();
    const secondRef =
      createRef<ComponentRef<typeof AdverseAccountSibling.Provider>>();

    await act(async () => {
      firstRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccount,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey: firstPartitionKey,
          children: createElement(AdverseAccount.Provider, {
            ref: firstRef,
            children: createElement('div', null, 'first competing replica'),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () => firstRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    // Authenticate the second partition after the shared account exists. The
    // commands still race below, while first-use user creation remains ordered.
    await act(async () => {
      secondRoot.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccountSibling,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey: secondPartitionKey,
          children: createElement(AdverseAccountSibling.Provider, {
            ref: secondRef,
            children: createElement('div', null, 'second competing replica'),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          secondRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const firstSession = firstRef.current?.session;
    const secondSession = secondRef.current?.session;
    if (firstSession === undefined || secondSession === undefined) {
      throw new Error('Both competing Providers must expose their sessions');
    }
    const firstStateBeforeStage = firstSession.store.getState();
    const secondStateBeforeStage = secondSession.store.getState();
    if (
      !firstStateBeforeStage.isInitialized ||
      !secondStateBeforeStage.isInitialized
    ) {
      throw new Error('Both competing databases must be initialized');
    }
    expect(firstStateBeforeStage.workerState.databaseName).not.toBe(
      secondStateBeforeStage.workerState.databaseName,
    );

    let firstOptimisticCartId: string | null = null;
    let secondOptimisticCartId: string | null = null;
    const unsubscribeFirstDatabase =
      firstStateBeforeStage.db.$client.subscribeToTableChanges(() => {
        const cart = firstStateBeforeStage.db.query.cart
          ?.findFirst({ where: { userId: { eq: userId } } })
          .sync();
        if (firstOptimisticCartId === null && cart !== undefined) {
          firstOptimisticCartId = cart.id;
        }
      });
    const unsubscribeSecondDatabase =
      secondStateBeforeStage.db.$client.subscribeToTableChanges(() => {
        const cart = secondStateBeforeStage.db.query.cart
          ?.findFirst({ where: { userId: { eq: userId } } })
          .sync();
        if (secondOptimisticCartId === null && cart !== undefined) {
          secondOptimisticCartId = cart.id;
        }
      });

    const firstCreateCartPromise = firstSession.stageCommand({
      contractName: 'createCart',
      payload: { userId },
    });
    const secondCreateCartPromise = secondSession.stageCommand({
      contractName: 'createCart',
      payload: { userId },
    });
    const firstCreateCart = await firstCreateCartPromise;
    const secondCreateCart = await secondCreateCartPromise;
    expect(firstCreateCart._tag).toBe('Right');
    expect(secondCreateCart._tag).toBe('Right');
    if (firstCreateCart._tag === 'Left') {
      throw new Error(firstCreateCart.left.message);
    }
    if (secondCreateCart._tag === 'Left') {
      throw new Error(secondCreateCart.left.message);
    }
    const firstCommandId = firstCreateCart.right.id;
    const secondCommandId = secondCreateCart.right.id;
    const firstCartId = firstCreateCart.right.payload.id;
    const secondCartId = secondCreateCart.right.payload.id;
    expect(firstCommandId).not.toBe(secondCommandId);
    expect(firstCartId).not.toBe(secondCartId);
    expect(firstOptimisticCartId).toBe(firstCartId);
    expect(secondOptimisticCartId).toBe(secondCartId);

    await expect
      .poll(
        () => {
          const firstState = firstSession.store.getState();
          const secondState = secondSession.store.getState();
          if (!firstState.isInitialized || !secondState.isInitialized) {
            return false;
          }
          const firstExecuted = firstState.db
            .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(sessionExecutedPushedCommandDrizzleSchema.id, firstCommandId),
            )
            .get();
          const firstFailed = firstState.db
            .select({ id: sessionFailedCommandDrizzleSchema.id })
            .from(sessionFailedCommandDrizzleSchema)
            .where(eq(sessionFailedCommandDrizzleSchema.id, firstCommandId))
            .get();
          const secondExecuted = secondState.db
            .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .where(
              eq(sessionExecutedPushedCommandDrizzleSchema.id, secondCommandId),
            )
            .get();
          const secondFailed = secondState.db
            .select({ id: sessionFailedCommandDrizzleSchema.id })
            .from(sessionFailedCommandDrizzleSchema)
            .where(eq(sessionFailedCommandDrizzleSchema.id, secondCommandId))
            .get();
          return (
            Number(firstExecuted !== undefined) +
              Number(firstFailed !== undefined) ===
              1 &&
            Number(secondExecuted !== undefined) +
              Number(secondFailed !== undefined) ===
              1
          );
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    const firstTerminalState = firstSession.store.getState();
    const secondTerminalState = secondSession.store.getState();
    if (
      !firstTerminalState.isInitialized ||
      !secondTerminalState.isInitialized
    ) {
      throw new Error('Both competing replicas must receive terminal state');
    }
    const firstExecuted = firstTerminalState.db
      .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
      .from(sessionExecutedPushedCommandDrizzleSchema)
      .where(eq(sessionExecutedPushedCommandDrizzleSchema.id, firstCommandId))
      .get();
    const firstFailed = firstTerminalState.db
      .select()
      .from(sessionFailedCommandDrizzleSchema)
      .where(eq(sessionFailedCommandDrizzleSchema.id, firstCommandId))
      .get();
    const secondExecuted = secondTerminalState.db
      .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
      .from(sessionExecutedPushedCommandDrizzleSchema)
      .where(eq(sessionExecutedPushedCommandDrizzleSchema.id, secondCommandId))
      .get();
    const secondFailed = secondTerminalState.db
      .select()
      .from(sessionFailedCommandDrizzleSchema)
      .where(eq(sessionFailedCommandDrizzleSchema.id, secondCommandId))
      .get();
    expect(
      Number(firstExecuted !== undefined) +
        Number(secondExecuted !== undefined),
    ).toBe(1);
    expect(
      Number(firstFailed !== undefined) + Number(secondFailed !== undefined),
    ).toBe(1);

    const winningCartId =
      firstFailed === undefined ? firstCartId : secondCartId;
    const rejectedCartId =
      firstFailed === undefined ? secondCartId : firstCartId;
    const rejectedCommandId =
      firstFailed === undefined ? secondCommandId : firstCommandId;
    const rejectedState =
      firstFailed === undefined ? secondTerminalState : firstTerminalState;
    const rejection = firstFailed === undefined ? secondFailed : firstFailed;
    expect(rejection?.id).toBe(rejectedCommandId);
    expect(rejection?.failure.length).toBeGreaterThan(0);

    await expect
      .poll(
        () => {
          const firstState = firstSession.store.getState();
          const secondState = secondSession.store.getState();
          if (!firstState.isInitialized || !secondState.isInitialized) {
            return null;
          }
          const firstCarts = firstState.db.query.cart?.findMany().sync();
          const secondCarts = secondState.db.query.cart?.findMany().sync();
          return {
            firstCartCount: firstCarts?.length ?? -1,
            firstCartId: firstCarts?.[0]?.id ?? null,
            secondCartCount: secondCarts?.length ?? -1,
            secondCartId: secondCarts?.[0]?.id ?? null,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        firstCartCount: 1,
        firstCartId: winningCartId,
        secondCartCount: 1,
        secondCartId: winningCartId,
      });
    expect(
      firstTerminalState.db.query.cart
        ?.findFirst({ where: { id: { eq: rejectedCartId } } })
        .sync(),
    ).toBeUndefined();
    expect(
      secondTerminalState.db.query.cart
        ?.findFirst({ where: { id: { eq: rejectedCartId } } })
        .sync(),
    ).toBeUndefined();
    expect(
      rejectedState.db
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .where(eq(sessionStagedCommandDrizzleSchema.id, rejectedCommandId))
        .all(),
    ).toEqual([]);
    expect(
      rejectedState.db
        .select()
        .from(sessionPushedCommandDrizzleSchema)
        .where(eq(sessionPushedCommandDrizzleSchema.id, rejectedCommandId))
        .all(),
    ).toEqual([]);
    expect(
      rejectedState.db
        .select()
        .from(sessionOptimisticAppliedMutationDrizzleSchema)
        .where(
          eq(
            sessionOptimisticAppliedMutationDrizzleSchema.commandId,
            rejectedCommandId,
          ),
        )
        .all(),
    ).toEqual([]);

    unsubscribeFirstDatabase();
    unsubscribeSecondDatabase();
    await act(async () => {
      secondRoot.unmount();
      firstRoot.unmount();
      await Promise.resolve();
    });
    secondContainer.remove();
    firstContainer.remove();
  }, 300_000);

  it('reconciles the original command ID after the real push commits but its response is lost', async () => {
    /*
     * 1. Bootstrap one real worker replica and retain its main-thread database.
     * 2. Wrap one real push call so the server response is discarded after commit.
     * 3. Stage one optimistic update and record its exact generated command ID.
     * 4. Let worker transport-uncertain repair fetch durable server evidence.
     * 5. Prove one executed row uses the original ID with no lifecycle residue.
     */
    const partitionKey = `adverse-response-loss-${testRunId}`;
    const clerkUserId = `adverse-response-loss-user-${testRunId}`;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const providerRef =
      createRef<ComponentRef<typeof AdverseAccount.Provider>>();

    await act(async () => {
      root.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: AdverseAccount,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          isSharedWorkerEnabled: true,
          partitionKey,
          children: createElement(AdverseAccount.Provider, {
            ref: providerRef,
            children: createElement('div', null, 'response-loss replica'),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          providerRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    const session = providerRef.current?.session;
    if (session === undefined) {
      throw new Error('The response-loss Provider must expose its session');
    }
    const stateBeforeLoss = session.store.getState();
    if (!stateBeforeLoss.isInitialized) {
      throw new Error('The response-loss database must be initialized');
    }
    const databaseBeforeLoss = stateBeforeLoss.db;
    const databaseNameBeforeLoss = stateBeforeLoss.workerState.databaseName;
    const actualFrontendModule = await vi.importActual<
      typeof import('@zerospin/frontend/pushFrontendCommands')
    >('@zerospin/frontend/pushFrontendCommands');
    vi.mocked(pushFrontendCommands).mockClear();
    vi.mocked(pushFrontendCommands).mockImplementationOnce(props =>
      actualFrontendModule.pushFrontendCommands(props).pipe(
        Effect.flatMap(() =>
          Effect.fail(
            new ZerospinError({
              code: 'adverse-transport-response-lost',
              message:
                'The real push committed, but this acceptance fault discards its response',
            }),
          ),
        ),
      ),
    );

    const reconciledName = `Reconciled after response loss ${testRunId}`;
    const staged = await session.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: reconciledName,
      },
    });
    expect(staged._tag).toBe('Right');
    if (staged._tag === 'Left') {
      throw new Error(staged.left.message);
    }
    const originalCommandId = staged.right.id;
    expect(
      stateBeforeLoss.db
        .select({ id: sessionStagedCommandDrizzleSchema.id })
        .from(sessionStagedCommandDrizzleSchema)
        .where(eq(sessionStagedCommandDrizzleSchema.id, originalCommandId))
        .get()?.id,
    ).toBe(originalCommandId);

    await expect
      .poll(() => vi.mocked(pushFrontendCommands).mock.calls.length, {
        interval: 50,
        timeout: 120_000,
      })
      .toBeGreaterThan(0);
    expect(
      vi.mocked(pushFrontendCommands).mock.calls[0]?.[0].commands[0]?.id,
    ).toBe(originalCommandId);
    await expect
      .poll(
        () => {
          const state = session.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return {
            executedRows: state.db
              .select({ id: sessionExecutedPushedCommandDrizzleSchema.id })
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .where(
                eq(
                  sessionExecutedPushedCommandDrizzleSchema.id,
                  originalCommandId,
                ),
              )
              .all(),
            name: state.db.query.user
              ?.findFirst({
                where: { id: { eq: User.prefixId(clerkUserId) } },
              })
              .sync()?.name,
            status: state.workerState.status,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        executedRows: [{ id: originalCommandId }],
        name: reconciledName,
        status: 'online',
      });

    const reconciledState = session.store.getState();
    if (!reconciledState.isInitialized) {
      throw new Error('The response-loss database must reconcile online');
    }
    expect(reconciledState.db).toBe(databaseBeforeLoss);
    expect(reconciledState.workerState.databaseName).toBe(
      databaseNameBeforeLoss,
    );
    expect(
      reconciledState.db
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .where(eq(sessionStagedCommandDrizzleSchema.id, originalCommandId))
        .all(),
    ).toEqual([]);
    expect(
      reconciledState.db
        .select()
        .from(sessionPushedCommandDrizzleSchema)
        .where(eq(sessionPushedCommandDrizzleSchema.id, originalCommandId))
        .all(),
    ).toEqual([]);
    expect(
      reconciledState.db
        .select()
        .from(sessionFailedCommandDrizzleSchema)
        .where(eq(sessionFailedCommandDrizzleSchema.id, originalCommandId))
        .all(),
    ).toEqual([]);
    expect(
      reconciledState.db
        .select()
        .from(sessionOptimisticAppliedMutationDrizzleSchema)
        .where(
          eq(
            sessionOptimisticAppliedMutationDrizzleSchema.commandId,
            originalCommandId,
          ),
        )
        .all(),
    ).toEqual([]);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  }, 300_000);

  it('terminates the real SharedWorker and resumes its persisted index with a fresh one-use ticket', async () => {
    /*
     * 1. Bootstrap a real worker replica/socket and settle one account command.
     * 2. Capture its persistent database name, terminal replica index, and ticket count.
     * 3. Use Chromium CDP to terminate the actual shared_worker target process.
     * 4. Reopen the same Config target, which creates a fresh worker/MessagePort.
     * 5. Prove the retained database/index/data resume and a fresh ticket is minted.
     */
    const partitionKey = `adverse-worker-restart-${testRunId}`;
    const clerkUserId = `adverse-worker-restart-user-${testRunId}`;
    vi.mocked(createFrontendWebSocketTicket).mockClear();
    vi.mocked(fetchFrontendState).mockClear();

    const firstController = makeBrowserPartitionController({
      partitionKey,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: frontendName => {
        if (frontendName !== shopperFrontend.frontendName) {
          return undefined;
        }
        return {
          frontend: AdverseAccount,
          generateSignature: () => Effect.succeed({ clerkUserId }),
        };
      },
    });
    const firstSessionId = adverseRuntime.runSync(
      makeIdFromAbbreviation({ abbreviation: coreAbbreviations.session }),
    );
    const firstSession = makeSession({
      frontend: shopperFrontend,
      generateSignature: () => Effect.succeed({ clerkUserId }),
      sessionId: firstSessionId,
      isSharedWorkerEnabled: true,
      runtime: adverseRuntime,
      stageFrontendCommand: props =>
        firstController.stageAccountFrontendCommand({
          sessionId: firstSessionId,
          ...props,
        }),
    });
    const firstBrowserSession = await adverseRuntime.runPromise(
      bootstrapBrowserSession({
        session: firstSession,
        browserPartitionController: firstController,
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(firstSession.store.getState().telemetryCollector),
        ),
      ),
    );
    const restartedName = `Persisted through worker restart ${testRunId}`;
    const staged = await firstSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(clerkUserId),
        name: restartedName,
      },
    });
    expect(staged._tag).toBe('Right');
    if (staged._tag === 'Left') {
      throw new Error(staged.left.message);
    }
    await expect
      .poll(
        () => {
          const state = firstSession.store.getState();
          if (!state.isInitialized) {
            return null;
          }
          return state.db
            .select()
            .from(sessionExecutedPushedCommandDrizzleSchema)
            .all()
            .find(command => command.id === staged.right.id)?.id;
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
    expect(persistedDatabaseName).not.toBeNull();
    await expect
      .poll(() => vi.mocked(createFrontendWebSocketTicket).mock.calls.length, {
        interval: 50,
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    const ticketCountBeforeRestart = vi.mocked(createFrontendWebSocketTicket)
      .mock.calls.length;

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

    await adverseRuntime
      .runPromise(firstBrowserSession.releaseBrowserSession)
      .catch(() => undefined);
    await firstController.release().catch(() => undefined);

    vi.mocked(fetchFrontendState).mockClear();
    const secondController = makeBrowserPartitionController({
      partitionKey,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: frontendName => {
        if (frontendName !== shopperFrontend.frontendName) {
          return undefined;
        }
        return {
          frontend: AdverseAccount,
          generateSignature: () => Effect.succeed({ clerkUserId }),
        };
      },
    });
    const secondSessionId = adverseRuntime.runSync(
      makeIdFromAbbreviation({ abbreviation: coreAbbreviations.session }),
    );
    const secondSession = makeSession({
      frontend: shopperFrontend,
      generateSignature: () => Effect.succeed({ clerkUserId }),
      sessionId: secondSessionId,
      isSharedWorkerEnabled: true,
      runtime: adverseRuntime,
      stageFrontendCommand: props =>
        secondController.stageAccountFrontendCommand({
          sessionId: secondSessionId,
          ...props,
        }),
    });
    const secondBrowserSession = await adverseRuntime.runPromise(
      bootstrapBrowserSession({
        session: secondSession,
        browserPartitionController: secondController,
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(secondSession.store.getState().telemetryCollector),
        ),
      ),
    );
    const secondState = secondSession.store.getState();
    if (!secondState.isInitialized || secondState.replicaIndex === null) {
      throw new Error('The restarted worker-backed session must initialize');
    }
    expect(secondState.workerState).toMatchObject({
      mode: 'shared-worker',
      status: 'online',
      bootstrapSource: 'replica',
      databaseName: persistedDatabaseName,
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
    await expect
      .poll(() => vi.mocked(createFrontendWebSocketTicket).mock.calls.length, {
        interval: 50,
        timeout: 120_000,
      })
      .toBeGreaterThan(ticketCountBeforeRestart);
    expect(vi.mocked(fetchFrontendState)).not.toHaveBeenCalled();

    await adverseRuntime.runPromise(secondBrowserSession.releaseBrowserSession);
    await secondController.release();
  }, 300_000);
});
