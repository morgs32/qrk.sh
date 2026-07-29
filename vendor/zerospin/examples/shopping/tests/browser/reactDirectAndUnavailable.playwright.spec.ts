/* oxlint-disable react/no-children-prop -- This exact .ts acceptance filename cannot contain JSX. */
import { act, createElement, createRef, type ComponentRef } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { sessionExecutedPushedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { makeBrowserPartitionController } from '@zerospin/react/makeBrowserPartitionController';
import { makeReactFrontend } from '@zerospin/react/makeReactFrontend';
import { makeReactServiceFrontend } from '@zerospin/react/makeReactServiceFrontend';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { Effect, Either, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { catalogFrontend, shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const apiUrl = 'http://127.0.0.1:3035/';
const publishableKey = 'pk_test';
const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const directPartitionKey = `react-direct-${testRunId}`;
const directClerkUserId = `browser-direct-account-${testRunId}`;
const directCatalogViewerId = `browser-direct-catalog-${testRunId}`;

const directRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('reactDirectAndUnavailable'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApisUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
);

const DirectAccount = makeReactFrontend({
  frontend: shopperFrontend,
  runtime: directRuntime,
});
const DirectService = makeReactServiceFrontend({
  frontend: catalogFrontend,
  runtime: directRuntime,
});

let mountedRoot: ReturnType<typeof createRoot> | null = null;
let mountedContainer: HTMLDivElement | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (mountedRoot !== null) {
    await act(async () => {
      mountedRoot?.unmount();
      await Promise.resolve();
    });
    mountedRoot = null;
  }
  mountedContainer?.remove();
  mountedContainer = null;
});

afterAll(async () => {
  await directRuntime.dispose();
});

describe('React direct and unavailable worker modes', () => {
  it('runs real direct account and service sessions without persistent replica state', async () => {
    // 1. The readiness endpoint is the authority that the real Wrangler-backed
    // deployment is listening; the test never replaces the server or socket.
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

    mountedContainer = document.createElement('div');
    document.body.appendChild(mountedContainer);
    mountedRoot = createRoot(mountedContainer);
    const accountRef = createRef<ComponentRef<typeof DirectAccount.Provider>>();
    const serviceRef = createRef<ComponentRef<typeof DirectService.Provider>>();

    // 2. Direct mode owns a main-thread database and socket for each Provider.
    // It must not create an IndexedDB locator or claim a replica database/index.
    await act(async () => {
      mountedRoot?.render(
        createElement(ZerospinConfig, {
          frontendAuthenticators: {
            web: {
              frontend: DirectAccount,
              generateSignature: () =>
                Effect.succeed({ clerkUserId: directClerkUserId }),
            },
            catalog: {
              frontend: DirectService,
              generateSignature: () =>
                Effect.succeed({ viewerId: directCatalogViewerId }),
            },
          },
          isSharedWorkerEnabled: false,
          partitionKey: directPartitionKey,
          children: createElement(DirectAccount.Provider, {
            ref: accountRef,
            children: createElement(DirectService.Provider, {
              ref: serviceRef,
              children: createElement('div', null, 'direct sessions ready'),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () =>
          accountRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          serviceRef.current?.session.store.getState().isInitialized ?? false,
        { interval: 100, timeout: 120_000 },
      )
      .toBe(true);

    const accountSession = accountRef.current?.session;
    const serviceSession = serviceRef.current?.session;
    if (accountSession === undefined || serviceSession === undefined) {
      throw new Error('Direct account and service Providers must be mounted');
    }
    const initialAccountState = accountSession.store.getState();
    const initialServiceState = serviceSession.store.getState();
    if (
      !initialAccountState.isInitialized ||
      !initialServiceState.isInitialized
    ) {
      throw new Error('Direct account and service sessions must initialize');
    }
    expect(initialAccountState.workerState).toEqual({
      mode: 'direct',
      status: 'online',
      bootstrapSource: 'network',
      frontendIndex: initialAccountState.frontendIndex,
      replicaIndex: null,
      databaseName: null,
      failure: null,
    });
    expect(initialServiceState.workerState).toEqual({
      mode: 'direct',
      status: 'online',
      bootstrapSource: 'network',
      frontendIndex: initialServiceState.frontendIndex,
      replicaIndex: null,
      databaseName: null,
      failure: null,
    });
    expect(
      globalThis.localStorage.getItem(
        `zerospin:frontend-locators:${directPartitionKey}`,
      ),
    ).toBeNull();
    expect('stageCommand' in serviceSession).toBe(false);

    // 3. Account staging is optimistic in the direct Provider database and the
    // same full command later settles through the live server-owned push path.
    const updatedName = `Direct mode ${testRunId}`;
    const staged = await accountSession.stageCommand({
      contractName: 'updateUser',
      payload: {
        id: User.prefixId(directClerkUserId),
        name: updatedName,
      },
    });
    expect(staged._tag).toBe('Right');
    if (staged._tag === 'Left') {
      throw new Error(staged.left.message);
    }
    const commandId = staged.right.id;

    await expect
      .poll(
        () => {
          const currentState = accountSession.store.getState();
          if (!currentState.isInitialized) {
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
              .findFirst({
                where: { id: { eq: User.prefixId(directClerkUserId) } },
              })
              .sync()?.name,
            replicaIndex: currentState.replicaIndex,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        executedIds: expect.arrayContaining([commandId]),
        name: updatedName,
        replicaIndex: null,
      });
  }, 240_000);

  it('fails explicit SharedWorker acquisition when browser support is unavailable', async () => {
    // This exercises the browser build with the native constructor removed at
    // the capability boundary. The result must remain a worker-mode failure;
    // no direct session or server/socket substitute is created.
    vi.stubGlobal('SharedWorker', undefined);
    const controller = makeBrowserPartitionController({
      partitionKey: `react-unavailable-${testRunId}`,
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });

    const acquisition = await directRuntime.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: shopperFrontend,
          apiUrl,
          publishableKey,
          systemId: 'sys_browser-unavailable',
          generationId: 'gen_browser-unavailable',
          systemVersion: '1.0.0',
          accountId: 'acct_browser-unavailable',
          accountName: shopperFrontend.accountName,
          actorId: 'actr_browser-unavailable',
          actorName: shopperFrontend.actorName,
          frontendName: shopperFrontend.frontendName,
          frontendVersion: shopperFrontend.version,
          frontendSpec: makeFrontendControllerSpec(shopperFrontend),
          frontendSpecHash: 'browser-unavailable-spec-hash',
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.either),
    );

    expect(Either.isLeft(acquisition)).toBe(true);
    if (Either.isLeft(acquisition)) {
      expect(acquisition.left.code).toBe(
        'failed-to-acquire-shared-worker-root',
      );
      expect(acquisition.left.cause).toContain('SharedWorker is not available');
    }
    expect(controller.store.getState().workerRootCount).toBe(0);
    await controller.release();
  });
});
