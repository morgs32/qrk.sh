// oxlint-disable-next-line typescript/triple-slash-reference -- Reuse the SharedWorker-owned ambient declaration for the third-party JS VFS.
/// <reference path="../../../../packages/shared-worker/src/drizzle/waSqliteIdbVfs.d.ts" />

/* oxlint-disable react/no-children-prop -- This browser acceptance file is .ts, so React trees are intentionally explicit createElement calls. */
import {
  act,
  createElement,
  createRef,
  Fragment,
  type ComponentRef,
} from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import type { IAnyError } from '@zerospin/error';
import { fetchFrontend } from '@zerospin/frontend/fetchFrontend';
import { makeTelemetryLayer } from '@zerospin/logger';
import { makeReactFrontend } from '@zerospin/react/makeReactFrontend';
import { makeReactServiceFrontend } from '@zerospin/react/makeReactServiceFrontend';
import { useCommissionFrontendReplica } from '@zerospin/react/useCommissionFrontendReplica';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { eq } from 'drizzle-orm';
import { Effect, Either, Layer, ManagedRuntime, Redacted } from 'effect';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// oxlint-disable-next-line eslint/no-restricted-imports -- The interruption acceptance test must reopen the real IDB VFS bytes without a debug RPC.
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

import {
  transitionCatalogFrontendV1,
  transitionShopperFrontendV1,
  transitionStableFrontendV1,
  TransitionUserV1,
} from './transition-fixture/version1Frontend';
import {
  transitionCatalogFrontendV2,
  transitionShopperFrontendV2,
} from './transition-fixture/version2Frontend';
import {
  transitionCatalogFrontendV3,
  transitionShopperFrontendV3,
} from './transition-fixture/version3Frontend';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

const apiUrl = 'http://127.0.0.1:3025/';
const publishableKey = 'pk_transition_fixture';
const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const partitionKey = `transition-commission-${testRunId}`;
const clerkUserId = `transition-user-${testRunId}`;
const catalogViewerId = `transition-catalog-${testRunId}`;

const transitionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    makePrefixedIncrementalIdFactory('reactTransitionsAndCommissioning'),
    IncrementalMonotonicFactory,
    Layer.succeed(ZerospinApisUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
);

const ReactWebV1 = makeReactFrontend({
  frontend: transitionShopperFrontendV1,
  runtime: transitionRuntime,
});
const ReactWebV2 = makeReactFrontend({
  frontend: transitionShopperFrontendV2,
  runtime: transitionRuntime,
});
const ReactWebV3 = makeReactFrontend({
  frontend: transitionShopperFrontendV3,
  runtime: transitionRuntime,
});
const ReactStable = makeReactFrontend({
  frontend: transitionStableFrontendV1,
  runtime: transitionRuntime,
});
const ReactCatalogV1 = makeReactServiceFrontend({
  frontend: transitionCatalogFrontendV1,
  runtime: transitionRuntime,
});
const ReactCatalogV2 = makeReactServiceFrontend({
  frontend: transitionCatalogFrontendV2,
  runtime: transitionRuntime,
});
const ReactCatalogV3 = makeReactServiceFrontend({
  frontend: transitionCatalogFrontendV3,
  runtime: transitionRuntime,
});

let webV2CommissionActions: Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}> | null = null;
let webV3CommissionActions: Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}> | null = null;
let catalogV2CommissionActions: Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}> | null = null;
let catalogV3CommissionActions: Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}> | null = null;

function WebV2CommissionProbe() {
  webV2CommissionActions = useCommissionFrontendReplica(ReactWebV2);
  return null;
}

function WebV3CommissionProbe() {
  webV3CommissionActions = useCommissionFrontendReplica(ReactWebV3);
  return null;
}

function CatalogV3CommissionProbe() {
  // Keep both service-version commission owners in this existing probe so the
  // transition fixture does not introduce another component abstraction.
  catalogV2CommissionActions = useCommissionFrontendReplica(ReactCatalogV2);
  catalogV3CommissionActions = useCommissionFrontendReplica(ReactCatalogV3);
  return null;
}

const mountedRoots = new Set<ReturnType<typeof createRoot>>();
const mountedContainers = new Set<HTMLDivElement>();

afterEach(async () => {
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
  await transitionRuntime.dispose();
});

describe('real Chromium version commissioning and generation transitions', () => {
  it('keeps persistent and direct sessions continuous across v1, v2, and v3 authority', async () => {
    /*
     * 1. Boot the isolated real v1 deployment and mount persistent account,
     *    stable-account, service, and direct-mode sessions.
     * 2. Point the live Config registry at v2 while v1 stays mounted and prove
     *    that a non-routable future controller cannot commission.
     * 3. Stop the server, stage a v1 command into the real worker journal,
     *    restart with model-identical v2, and prove the version gate.
     * 4. Commission account and service v2 without replacing either v1 active
     *    locator, then mount v2 code and prove same-generation activation with
     *    no boundary/index reset.
     * 5. Stop again and stage v2 worker intent plus matched/unmatched direct
     *    intent before starting the v3 successor generation.
     * 6. Prove the unchanged stable controller transitions the same database
     *    in place while web/catalog v2/v1 remain readable and update-required.
     * 7. Commission web/catalog v3, prove dormant source intent has not run,
     *    and prove release closes the last commission-only service socket while
     *    retaining its catalog row and database name.
     * 8. Mount matching v3 code, prove journal-first adaptation/activation and
     *    source-last release, then prove commission release does not close a
     *    socket still owned by the active Provider.
     * 9. Prove unmatched direct account and service code retain their old views
     *    in update-required, while refreshed v3 code creates current ordinary
     *    non-persistent views rather than leaving stale controllers active.
     */

    // 1 — global setup owns real zerospin dev and exposes only readiness and
    // controlled code-selection operations. HTTP 204, not elapsed time, is the
    // deployment barrier.
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('/__zerospin/ready')).status;
          } catch {
            return 0;
          }
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(204);

    const mainContainer = document.createElement('div');
    const directStableContainer = document.createElement('div');
    const directWebContainer = document.createElement('div');
    const directCatalogContainer = document.createElement('div');
    document.body.appendChild(mainContainer);
    document.body.appendChild(directStableContainer);
    document.body.appendChild(directWebContainer);
    document.body.appendChild(directCatalogContainer);
    mountedContainers.add(mainContainer);
    mountedContainers.add(directStableContainer);
    mountedContainers.add(directWebContainer);
    mountedContainers.add(directCatalogContainer);
    const mainRoot = createRoot(mainContainer);
    const directStableRoot = createRoot(directStableContainer);
    const directWebRoot = createRoot(directWebContainer);
    const directCatalogRoot = createRoot(directCatalogContainer);
    mountedRoots.add(mainRoot);
    mountedRoots.add(directStableRoot);
    mountedRoots.add(directWebRoot);
    mountedRoots.add(directCatalogRoot);

    const webV1Ref = createRef<ComponentRef<typeof ReactWebV1.Provider>>();
    const webV2Ref = createRef<ComponentRef<typeof ReactWebV2.Provider>>();
    const webV3Ref = createRef<ComponentRef<typeof ReactWebV3.Provider>>();
    const stableRef = createRef<ComponentRef<typeof ReactStable.Provider>>();
    const catalogV1Ref =
      createRef<ComponentRef<typeof ReactCatalogV1.Provider>>();
    const catalogV2Ref =
      createRef<ComponentRef<typeof ReactCatalogV2.Provider>>();
    const catalogV3Ref =
      createRef<ComponentRef<typeof ReactCatalogV3.Provider>>();
    const directStableRef =
      createRef<ComponentRef<typeof ReactStable.Provider>>();
    const directWebV1Ref =
      createRef<ComponentRef<typeof ReactWebV1.Provider>>();
    const directWebV2Ref =
      createRef<ComponentRef<typeof ReactWebV2.Provider>>();
    const directWebV3Ref =
      createRef<ComponentRef<typeof ReactWebV3.Provider>>();
    const directCatalogV1Ref =
      createRef<ComponentRef<typeof ReactCatalogV1.Provider>>();
    const directCatalogV2Ref =
      createRef<ComponentRef<typeof ReactCatalogV2.Provider>>();
    const directCatalogV3Ref =
      createRef<ComponentRef<typeof ReactCatalogV3.Provider>>();

    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV1.Provider, {
                key: 'provider-web',
                ref: webV1Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV1.Provider, {
                    ref: catalogV1Ref,
                    children: createElement('div', null, 'v1 persistent'),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () => ({
          web:
            webV1Ref.current?.session.store.getState().isInitialized ?? false,
          stable:
            stableRef.current?.session.store.getState().isInitialized ?? false,
          catalog:
            catalogV1Ref.current?.session.store.getState().isInitialized ??
            false,
        }),
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({ web: true, stable: true, catalog: true });

    await act(async () => {
      directStableRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-stable`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          children: createElement(ReactStable.Provider, {
            ref: directStableRef,
            children: createElement('div', null, 'direct stable v1'),
          }),
        }),
      );
      directWebRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-web`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          children: createElement(ReactWebV1.Provider, {
            ref: directWebV1Ref,
            children: createElement('div', null, 'direct web v1'),
          }),
        }),
      );
      directCatalogRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-catalog`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            catalog: {
              frontend: ReactCatalogV1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(ReactCatalogV1.Provider, {
            ref: directCatalogV1Ref,
            children: createElement('div', null, 'direct catalog v1'),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () => ({
          stable:
            directStableRef.current?.session.store.getState().isInitialized ??
            false,
          web:
            directWebV1Ref.current?.session.store.getState().isInitialized ??
            false,
          catalog:
            directCatalogV1Ref.current?.session.store.getState()
              .isInitialized ?? false,
        }),
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({ stable: true, web: true, catalog: true });

    const initialWebState = webV1Ref.current?.session.store.getState();
    const initialStableState = stableRef.current?.session.store.getState();
    const initialCatalogState = catalogV1Ref.current?.session.store.getState();
    const initialDirectStableState =
      directStableRef.current?.session.store.getState();
    const initialDirectWebState =
      directWebV1Ref.current?.session.store.getState();
    const initialDirectCatalogState =
      directCatalogV1Ref.current?.session.store.getState();
    if (
      initialWebState === undefined ||
      !initialWebState.isInitialized ||
      initialStableState === undefined ||
      !initialStableState.isInitialized ||
      initialCatalogState === undefined ||
      !initialCatalogState.isInitialized ||
      initialDirectStableState === undefined ||
      !initialDirectStableState.isInitialized ||
      initialDirectWebState === undefined ||
      !initialDirectWebState.isInitialized ||
      initialDirectCatalogState === undefined ||
      !initialDirectCatalogState.isInitialized
    ) {
      throw new Error('All v1 transition sessions must initialize');
    }
    const catalogV1Session = catalogV1Ref.current?.session;
    const directWebV1Session = directWebV1Ref.current?.session;
    const directCatalogV1Session = directCatalogV1Ref.current?.session;
    if (
      catalogV1Session === undefined ||
      directWebV1Session === undefined ||
      directCatalogV1Session === undefined
    ) {
      throw new Error('All version-specific v1 sessions must remain mounted');
    }
    const v1GenerationId = initialWebState.generationId;
    const v1FrontendIndex = initialWebState.frontendIndex;
    const v1CatalogFrontendIndex = initialCatalogState.frontendIndex;
    const persistentWebDatabase = initialWebState.db;
    const directStableDatabase = initialDirectStableState.db;
    const directWebV1Database = initialDirectWebState.db;
    const directCatalogV1Database = initialDirectCatalogState.db;
    const transitionTelemetryCollector = initialWebState.telemetryCollector;
    expect(initialWebState.workerState.mode).toBe('shared-worker');
    expect(initialCatalogState.workerState.mode).toBe('shared-worker');
    expect(initialDirectStableState.workerState).toMatchObject({
      mode: 'direct',
      replicaIndex: null,
      databaseName: null,
    });
    expect(initialDirectCatalogState.workerState).toMatchObject({
      mode: 'direct',
      replicaIndex: null,
      databaseName: null,
    });

    // 2 — the controller object stays stable while Config reads its latest
    // authenticator registry by reference. v1 remains mounted and readable,
    // but account and service v2 cannot commission before ordinary API routing
    // promotes those version-specific controllers.
    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV2,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV2,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV1.Provider, {
                key: 'provider-web',
                ref: webV1Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV1.Provider, {
                    ref: catalogV1Ref,
                    children: createElement('div', null, 'v1 still mounted'),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });
    if (webV2CommissionActions === null) {
      throw new Error('v2 commission hook did not render');
    }
    const nonRoutableV2Commission = await webV2CommissionActions.commission();
    expect(nonRoutableV2Commission._tag).toBe('Left');
    if (nonRoutableV2Commission._tag === 'Right') {
      throw new Error('A pre-promotion v2 candidate was commissioned');
    }
    expect(nonRoutableV2Commission.left.code).toBe('frontend-version-changed');
    if (catalogV2CommissionActions === null) {
      throw new Error('v2 service commission hook did not render');
    }
    const nonRoutableCatalogV2Commission =
      await catalogV2CommissionActions.commission();
    expect(nonRoutableCatalogV2Commission._tag).toBe('Left');
    if (nonRoutableCatalogV2Commission._tag === 'Right') {
      throw new Error('A pre-promotion v2 service candidate was commissioned');
    }
    expect(nonRoutableCatalogV2Commission.left.code).toBe(
      'frontend-version-changed',
    );
    expect(webV1Ref.current?.session.store.getState().isInitialized).toBe(true);
    expect(catalogV1Ref.current?.session.store.getState().isInitialized).toBe(
      true,
    );

    const diagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === partitionKey);
    if (diagnosticRoot === undefined) {
      throw new Error('Expected the transition Config diagnostic root');
    }
    expect(
      await Effect.runPromise(
        decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
      ),
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ frontendVersion: '2.0.0' }),
      ]),
    );
    expect(
      await Effect.runPromise(
        decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frontendName: 'web',
          frontendVersion: '1.0.0',
          role: 'active',
          activeProviderCount: 1,
        }),
      ]),
    );
    expect(
      await Effect.runPromise(
        decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
      ),
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ frontendVersion: '2.0.0' }),
      ]),
    );

    // Restore v1 authority before taking the server offline so the existing
    // Provider never needs to reauthenticate through the future controller.
    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV1,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV1,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV1.Provider, {
                key: 'provider-web',
                ref: webV1Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV1.Provider, {
                    ref: catalogV1Ref,
                    children: createElement('div', null, 'v1 restored'),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });

    // 3 — stop real workerd, wait for the worker-owned socket to close, then
    // stage v1 intent. The full command and mutations are durable before this
    // call resolves and cannot be executed by dormant v2 commissioning.
    const stopV1 = await fetch('/__transition-control/stop', {
      method: 'POST',
    });
    expect(stopV1.status).toBe(204);
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
          );
          const row = rows.find(
            candidate =>
              candidate.frontendName === 'web' &&
              candidate.frontendVersion === '1.0.0',
          );
          return {
            socketState: row?.socketState,
            activeProviderCount: row?.activeProviderCount,
          };
        },
        { interval: 100, timeout: 60_000 },
      )
      .toEqual({ socketState: 'disconnected', activeProviderCount: 1 });

    const webV1Session = webV1Ref.current?.session;
    if (webV1Session === undefined) {
      throw new Error('v1 web session disappeared before offline staging');
    }
    const sameGenerationDormantLabel = `same-generation-${testRunId}`;
    const stagedV1 = await webV1Session.stageCommand({
      contractName: 'renameTransitionUser',
      payload: {
        id: TransitionUserV1.prefixId(clerkUserId),
        name: sameGenerationDormantLabel,
      },
    });
    if (stagedV1._tag === 'Left') {
      throw new Error(JSON.stringify(stagedV1.left));
    }
    expect(stagedV1._tag).toBe('Right');
    const stagedV1CommandId = stagedV1.right.id;
    expect(
      persistentWebDatabase
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .all()
        .map(command => command.id),
    ).toContain(stagedV1CommandId);

    const startV2 = await fetch('/__transition-control/start/v2', {
      method: 'POST',
    });
    expect(startV2.status, await startV2.text()).toBe(204);
    globalThis.dispatchEvent(new Event('online'));
    await expect
      .poll(
        async () => {
          const authority = await transitionRuntime.runPromise(
            fetchFrontend({
              frontend: transitionShopperFrontendV2,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            }).pipe(
              Effect.either,
              Effect.provide(makeTelemetryLayer(transitionTelemetryCollector)),
            ),
          );
          if (Either.isLeft(authority)) {
            return authority.left.code;
          }
          authority.right.releaseFrontendApi();
          return {
            generationId: authority.right.identity.generationId,
            frontendVersion: authority.right.identity.frontendVersion,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({ generationId: v1GenerationId, frontendVersion: '2.0.0' });
    await expect
      .poll(
        () => ({
          account: webV1Session.store.getState().workerState.status,
          service: catalogV1Session.store.getState().workerState.status,
        }),
        {
          interval: 100,
          timeout: 120_000,
        },
      )
      .toEqual({ account: 'update-required', service: 'update-required' });
    expect(webV1Session.store.getState().generationId).toBe(v1GenerationId);
    expect(webV1Session.store.getState().frontendIndex).toBe(v1FrontendIndex);
    expect(catalogV1Session.store.getState().generationId).toBe(v1GenerationId);
    expect(catalogV1Session.store.getState().frontendIndex).toBe(
      v1CatalogFrontendIndex,
    );

    // Direct v1 account and service instances have no commissioned target; the
    // same authority gate suspends both until refreshed matching code performs
    // ordinary full-state bootstrap. Their old database views remain readable.
    await expect
      .poll(
        () => ({
          account: directWebV1Session.store.getState().workerState.status,
          service: directCatalogV1Session.store.getState().workerState.status,
        }),
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({ account: 'update-required', service: 'update-required' });
    expect(directWebV1Session.store.getState().db).toBe(directWebV1Database);
    expect(directCatalogV1Session.store.getState().db).toBe(
      directCatalogV1Database,
    );
    expect(
      directWebV1Database.query.transitionUser
        ?.findFirst({
          where: { id: { eq: TransitionUserV1.prefixId(clerkUserId) } },
        })
        .sync()?.name,
    ).toBeNull();
    expect(
      directCatalogV1Database.query.transitionProduct
        ?.findMany()
        .sync()
        .map(product => product.name),
    ).toContain('Transition fixture product');

    // 4 — switch the account and service Config registry entries to v2 while
    // both v1 Providers remain mounted, commission the now-routable targets,
    // and retain both active-v1 and commissioned-v2 locator records.
    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV2,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV2,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV1.Provider, {
                key: 'provider-web',
                ref: webV1Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV1.Provider, {
                    ref: catalogV1Ref,
                    children: createElement(
                      'div',
                      null,
                      'v1 plus v2 commission',
                    ),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });
    if (
      webV2CommissionActions === null ||
      catalogV2CommissionActions === null
    ) {
      throw new Error('v2 account or service commission hook disappeared');
    }
    const commissionedV2 = await webV2CommissionActions.commission();
    if (Either.isLeft(commissionedV2)) {
      throw new Error(
        `Account v2 commissioning failed: ${JSON.stringify(commissionedV2.left)}`,
      );
    }
    const commissionedCatalogV2 = await catalogV2CommissionActions.commission();
    if (Either.isLeft(commissionedCatalogV2)) {
      throw new Error(
        `Service v2 commissioning failed: ${JSON.stringify(commissionedCatalogV2.left)}`,
      );
    }
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
          );
          return rows
            .filter(row => row.frontendName === 'web')
            .map(row => ({
              version: row.frontendVersion,
              role: row.role,
              socket: row.socketState,
            }))
            .sort((left, right) => left.version.localeCompare(right.version));
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual([
        expect.objectContaining({
          version: '1.0.0',
          role: 'active',
        }),
        expect.objectContaining({
          version: '2.0.0',
          role: 'commissioned',
          socket: 'online',
        }),
      ]);
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
          );
          return rows
            .filter(row => row.frontendName === 'catalog')
            .map(row => ({
              version: row.frontendVersion,
              role: row.role,
              socket: row.socketState,
            }))
            .sort((left, right) => left.version.localeCompare(right.version));
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual([
        expect.objectContaining({
          version: '1.0.0',
          role: 'active',
        }),
        expect.objectContaining({
          version: '2.0.0',
          role: 'commissioned',
          socket: 'online',
        }),
      ]);
    const locatorsDuringV2Commission = localStorage.getItem(
      `zerospin:frontend-locators:${partitionKey}`,
    );
    expect(locatorsDuringV2Commission).toContain('1.0.0');
    expect(locatorsDuringV2Commission).toContain('2.0.0');
    expect(locatorsDuringV2Commission).toContain('commissioned');

    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV2,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV2,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV2.Provider, {
                key: 'provider-web',
                ref: webV2Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV2.Provider, {
                    ref: catalogV2Ref,
                    children: createElement('div', null, 'v2 activated'),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () => {
          const state = webV2Ref.current?.session.store.getState();
          const serviceState = catalogV2Ref.current?.session.store.getState();
          if (
            state === undefined ||
            !state.isInitialized ||
            serviceState === undefined ||
            !serviceState.isInitialized
          ) {
            return null;
          }
          const query = state.db.query.transitionUser;
          const serviceQuery = serviceState.db.query.transitionProduct;
          if (query === undefined || serviceQuery === undefined) return null;
          return {
            generationId: state.generationId,
            status: state.workerState.status,
            name: query
              .findFirst({
                where: {
                  id: { eq: TransitionUserV1.prefixId(clerkUserId) },
                },
              })
              .sync()?.name,
            executed: state.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            staged: state.db
              .select()
              .from(sessionStagedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            pushed: state.db
              .select()
              .from(sessionPushedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            serviceGenerationId: serviceState.generationId,
            serviceFrontendIndex: serviceState.frontendIndex,
            serviceStatus: serviceState.workerState.status,
            serviceProducts: serviceQuery
              .findMany()
              .sync()
              .map(product => product.name),
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        generationId: v1GenerationId,
        status: 'online',
        name: `v2:${sameGenerationDormantLabel}`,
        executed: expect.arrayContaining([stagedV1CommandId]),
        staged: [],
        pushed: [],
        serviceGenerationId: v1GenerationId,
        serviceFrontendIndex: v1CatalogFrontendIndex,
        serviceStatus: 'online',
        serviceProducts: expect.arrayContaining(['Transition fixture product']),
      });
    const catalogV2Session = catalogV2Ref.current?.session;
    if (catalogV2Session === undefined) {
      throw new Error('Matching v2 service Provider did not expose a session');
    }
    const catalogV2State = catalogV2Session.store.getState();
    if (!catalogV2State.isInitialized) {
      throw new Error('Matching v2 service Provider did not initialize');
    }
    const catalogV2Database = catalogV2State.db;
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
          );
          const source = rows.find(
            row =>
              row.frontendName === 'catalog' && row.frontendVersion === '1.0.0',
          );
          const target = rows.find(
            row =>
              row.frontendName === 'catalog' && row.frontendVersion === '2.0.0',
          );
          return {
            sourceDatabaseName: source?.databaseName,
            sourceProviders: source?.activeProviderCount,
            targetRole: target?.role,
            targetHasProvider: (target?.activeProviderCount ?? 0) > 0,
            targetSocket: target?.socketState,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        sourceDatabaseName: expect.any(String),
        sourceProviders: 0,
        targetRole: 'active',
        targetHasProvider: true,
        targetSocket: 'online',
      });
    expect(Either.isRight(await webV2CommissionActions.release())).toBe(true);
    expect(Either.isRight(await catalogV2CommissionActions.release())).toBe(
      true,
    );

    // Refresh direct account and service mode with matching v2 code. Each
    // performs an ordinary online bootstrap into a new main-thread database,
    // and neither advertises a persistent database name or replica index.
    await act(async () => {
      directWebRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-web`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV2,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          children: createElement(ReactWebV2.Provider, {
            ref: directWebV2Ref,
            children: createElement('div', null, 'direct web v2'),
          }),
        }),
      );
      directCatalogRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-catalog`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            catalog: {
              frontend: ReactCatalogV2,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(ReactCatalogV2.Provider, {
            ref: directCatalogV2Ref,
            children: createElement('div', null, 'direct catalog v2'),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () => {
          const state = directWebV2Ref.current?.session.store.getState();
          const serviceState =
            directCatalogV2Ref.current?.session.store.getState();
          if (
            state === undefined ||
            !state.isInitialized ||
            serviceState === undefined ||
            !serviceState.isInitialized
          ) {
            return null;
          }
          const query = state.db.query.transitionUser;
          const serviceQuery = serviceState.db.query.transitionProduct;
          if (query === undefined || serviceQuery === undefined) return null;
          return {
            accountGeneration: state.generationId,
            accountStatus: state.workerState.status,
            accountDatabaseIsNew: state.db !== directWebV1Database,
            accountDatabaseName: state.workerState.databaseName,
            accountReplicaIndex: state.workerState.replicaIndex,
            accountName: query
              .findFirst({
                where: {
                  id: { eq: TransitionUserV1.prefixId(clerkUserId) },
                },
              })
              .sync()?.name,
            serviceGeneration: serviceState.generationId,
            serviceStatus: serviceState.workerState.status,
            serviceDatabaseIsNew: serviceState.db !== directCatalogV1Database,
            serviceDatabaseName: serviceState.workerState.databaseName,
            serviceReplicaIndex: serviceState.workerState.replicaIndex,
            serviceProducts: serviceQuery
              .findMany()
              .sync()
              .map(product => product.name),
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        accountGeneration: v1GenerationId,
        accountStatus: 'online',
        accountDatabaseIsNew: true,
        accountDatabaseName: null,
        accountReplicaIndex: null,
        accountName: `v2:${sameGenerationDormantLabel}`,
        serviceGeneration: v1GenerationId,
        serviceStatus: 'online',
        serviceDatabaseIsNew: true,
        serviceDatabaseName: null,
        serviceReplicaIndex: null,
        serviceProducts: expect.arrayContaining(['Transition fixture product']),
      });
    const directWebV2Session = directWebV2Ref.current?.session;
    const directCatalogV2Session = directCatalogV2Ref.current?.session;
    if (
      directWebV2Session === undefined ||
      directCatalogV2Session === undefined
    ) {
      throw new Error('Matching direct v2 Providers did not expose sessions');
    }
    const directWebV2CurrentState = directWebV2Session.store.getState();
    const directCatalogV2CurrentState = directCatalogV2Session.store.getState();
    if (
      !directWebV2CurrentState.isInitialized ||
      !directCatalogV2CurrentState.isInitialized
    ) {
      throw new Error('Matching direct v2 Providers did not initialize');
    }
    const directWebV2Database = directWebV2CurrentState.db;
    const directCatalogV2Database = directCatalogV2CurrentState.db;

    // 5 — take v2 offline and persist one web command plus one unchanged stable
    // command. The direct stable page keeps a separate in-memory staged command
    // for the matched-generation transition path.
    const stopV2 = await fetch('/__transition-control/stop', {
      method: 'POST',
    });
    expect(stopV2.status).toBe(204);
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listServiceFrontendReplicas()),
          );
          const web = accountRows.find(
            row =>
              row.frontendName === 'web' && row.frontendVersion === '2.0.0',
          );
          const stable = accountRows.find(row => row.frontendName === 'stable');
          const catalog = serviceRows.find(
            row =>
              row.frontendName === 'catalog' && row.frontendVersion === '2.0.0',
          );
          return {
            web: web?.socketState,
            stable: stable?.socketState,
            catalog: catalog?.socketState,
          };
        },
        { interval: 100, timeout: 60_000 },
      )
      .toEqual({
        web: 'disconnected',
        stable: 'disconnected',
        catalog: 'disconnected',
      });

    const webV2Session = webV2Ref.current?.session;
    const stableSession = stableRef.current?.session;
    const directStableSession = directStableRef.current?.session;
    if (
      webV2Session === undefined ||
      stableSession === undefined ||
      directStableSession === undefined
    ) {
      throw new Error('v2 sessions disappeared before successor staging');
    }
    const successorDormantLabel = `successor-${testRunId}`;
    const stagedV2 = await webV2Session.stageCommand({
      contractName: 'renameTransitionUser',
      payload: {
        id: TransitionUserV1.prefixId(clerkUserId),
        label: successorDormantLabel,
      },
    });
    expect(stagedV2._tag).toBe('Right');
    if (stagedV2._tag === 'Left') throw new Error(stagedV2.left.message);
    const stagedV2CommandId = stagedV2.right.id;

    const persistentStableNote = `persistent-stable-${testRunId}`;
    const stagedPersistentStable = await stableSession.stageCommand({
      contractName: 'setTransitionUserNote',
      payload: {
        id: TransitionUserV1.prefixId(clerkUserId),
        note: persistentStableNote,
      },
    });
    expect(stagedPersistentStable._tag).toBe('Right');
    if (stagedPersistentStable._tag === 'Left') {
      throw new Error(stagedPersistentStable.left.message);
    }

    // Keep both direct commands local until the generation transition has
    // replaced authoritative state and rebuilt the optimistic overlay. This
    // makes the assertions below observe the five-pass journal adaptation,
    // rather than allowing either command to settle before the boundary.
    directStableSession.store.setState({ isPushPaused: true });
    const directStableNote = `direct-stable-first-${testRunId}`;
    const stagedDirectStable = await directStableSession.stageCommand({
      contractName: 'setTransitionUserNote',
      payload: {
        id: TransitionUserV1.prefixId(clerkUserId),
        note: directStableNote,
      },
    });
    expect(stagedDirectStable._tag).toBe('Right');
    if (stagedDirectStable._tag === 'Left') {
      throw new Error(stagedDirectStable.left.message);
    }

    const directStableLaterNote = `direct-stable-later-${testRunId}`;
    const stagedDirectStableLater = await directStableSession.stageCommand({
      contractName: 'setTransitionUserNote',
      payload: {
        id: TransitionUserV1.prefixId(clerkUserId),
        note: directStableLaterNote,
      },
    });
    expect(stagedDirectStableLater._tag).toBe('Right');
    if (stagedDirectStableLater._tag === 'Left') {
      throw new Error(stagedDirectStableLater.left.message);
    }

    const directStableFirstRowBeforeSuccessor = directStableDatabase
      .select()
      .from(sessionStagedCommandDrizzleSchema)
      .where(
        eq(
          sessionStagedCommandDrizzleSchema.id,
          stagedDirectStable.right.id,
        ),
      )
      .get();
    const directStableLaterRowBeforeSuccessor = directStableDatabase
      .select()
      .from(sessionStagedCommandDrizzleSchema)
      .where(
        eq(
          sessionStagedCommandDrizzleSchema.id,
          stagedDirectStableLater.right.id,
        ),
      )
      .get();
    if (
      directStableFirstRowBeforeSuccessor === undefined ||
      directStableLaterRowBeforeSuccessor === undefined
    ) {
      throw new Error(
        'Both paused direct stable commands must be durable before v3 starts',
      );
    }

    const v2WebStateBeforeSuccessor = webV2Session.store.getState();
    const v2StableStateBeforeSuccessor = stableSession.store.getState();
    if (
      !v2WebStateBeforeSuccessor.isInitialized ||
      !v2StableStateBeforeSuccessor.isInitialized
    ) {
      throw new Error('v2 worker sessions must remain readable offline');
    }
    const v2WebDatabase = v2WebStateBeforeSuccessor.db;
    const v2StableFrontendIndex = v2StableStateBeforeSuccessor.frontendIndex;

    const startV3 = await fetch('/__transition-control/start/v3', {
      method: 'POST',
    });
    expect(startV3.status, await startV3.text()).toBe(204);
    globalThis.dispatchEvent(new Event('online'));
    let v3GenerationId: string | null = null;
    let v3SystemVersion: string | null = null;
    await expect
      .poll(
        async () => {
          const authority = await transitionRuntime.runPromise(
            fetchFrontend({
              frontend: transitionShopperFrontendV3,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            }).pipe(
              Effect.either,
              Effect.provide(makeTelemetryLayer(transitionTelemetryCollector)),
            ),
          );
          if (Either.isLeft(authority)) return authority.left.code;
          const observed = {
            generationId: authority.right.identity.generationId,
            frontendVersion: authority.right.identity.frontendVersion,
          };
          v3GenerationId = observed.generationId;
          v3SystemVersion = authority.right.identity.systemVersion;
          authority.right.releaseFrontendApi();
          return observed.frontendVersion;
        },
        { interval: 100, timeout: 180_000 },
      )
      .toBe('3.0.0');
    expect(v3GenerationId).not.toBeNull();
    expect(v3GenerationId).not.toBe(v1GenerationId);
    expect(v3SystemVersion).not.toBeNull();

    // The direct replica must first become readable under v3 while both
    // commands are still paused. The rows keep their original identity,
    // ordering, timestamp, payload, and provenance; only the authoritative
    // system version is rewritten. Replaying the two current programs in
    // staged-cursor order must leave the later note visible.
    await expect
      .poll(
        () => {
          const directState = directStableSession.store.getState();
          if (!directState.isInitialized) {
            return null;
          }
          const directQuery = directState.db.query.transitionUser;
          if (directQuery === undefined) {
            return null;
          }
          const firstRow = directState.db
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .where(
              eq(
                sessionStagedCommandDrizzleSchema.id,
                stagedDirectStable.right.id,
              ),
            )
            .get();
          const laterRow = directState.db
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .where(
              eq(
                sessionStagedCommandDrizzleSchema.id,
                stagedDirectStableLater.right.id,
              ),
            )
            .get();
          if (firstRow === undefined || laterRow === undefined) {
            return null;
          }
          return {
            generationId: directState.generationId,
            dbIsSame: directState.db === directStableDatabase,
            status: directState.workerState.status,
            visibleNote: directQuery
              .findFirst({
                where: {
                  id: { eq: TransitionUserV1.prefixId(clerkUserId) },
                },
              })
              .sync()?.note,
            firstId: firstRow.id,
            firstCommandName: firstRow.commandName,
            firstPayload: firstRow.payload,
            firstSystemName: firstRow.systemName,
            firstSystemVersion: firstRow.systemVersion,
            firstContractVersion: firstRow.version,
            firstCommandType: firstRow.commandType,
            firstAccountId: firstRow.accountId,
            firstAccountName: firstRow.accountName,
            firstFrontendName: firstRow.frontendName,
            firstActorId: firstRow.actorId,
            firstActorName: firstRow.actorName,
            firstSessionId: firstRow.sessionId,
            firstStatus: firstRow.status,
            firstStagedCursor: firstRow.stagedCursor,
            firstStagedAt: firstRow.stagedAt,
            firstPushedCursor: firstRow.pushedCursor,
            laterId: laterRow.id,
            laterCommandName: laterRow.commandName,
            laterPayload: laterRow.payload,
            laterSystemName: laterRow.systemName,
            laterSystemVersion: laterRow.systemVersion,
            laterContractVersion: laterRow.version,
            laterCommandType: laterRow.commandType,
            laterAccountId: laterRow.accountId,
            laterAccountName: laterRow.accountName,
            laterFrontendName: laterRow.frontendName,
            laterActorId: laterRow.actorId,
            laterActorName: laterRow.actorName,
            laterSessionId: laterRow.sessionId,
            laterStatus: laterRow.status,
            laterStagedCursor: laterRow.stagedCursor,
            laterStagedAt: laterRow.stagedAt,
            laterPushedCursor: laterRow.pushedCursor,
          };
        },
        { interval: 100, timeout: 180_000 },
      )
      .toEqual({
        generationId: v3GenerationId,
        dbIsSame: true,
        status: 'online',
        visibleNote: directStableLaterNote,
        firstId: directStableFirstRowBeforeSuccessor.id,
        firstCommandName: directStableFirstRowBeforeSuccessor.commandName,
        firstPayload: directStableFirstRowBeforeSuccessor.payload,
        firstSystemName: directStableFirstRowBeforeSuccessor.systemName,
        firstSystemVersion: v3SystemVersion,
        firstContractVersion: directStableFirstRowBeforeSuccessor.version,
        firstCommandType: directStableFirstRowBeforeSuccessor.commandType,
        firstAccountId: directStableFirstRowBeforeSuccessor.accountId,
        firstAccountName: directStableFirstRowBeforeSuccessor.accountName,
        firstFrontendName: directStableFirstRowBeforeSuccessor.frontendName,
        firstActorId: directStableFirstRowBeforeSuccessor.actorId,
        firstActorName: directStableFirstRowBeforeSuccessor.actorName,
        firstSessionId: directStableFirstRowBeforeSuccessor.sessionId,
        firstStatus: directStableFirstRowBeforeSuccessor.status,
        firstStagedCursor: directStableFirstRowBeforeSuccessor.stagedCursor,
        firstStagedAt: directStableFirstRowBeforeSuccessor.stagedAt,
        firstPushedCursor: directStableFirstRowBeforeSuccessor.pushedCursor,
        laterId: directStableLaterRowBeforeSuccessor.id,
        laterCommandName: directStableLaterRowBeforeSuccessor.commandName,
        laterPayload: directStableLaterRowBeforeSuccessor.payload,
        laterSystemName: directStableLaterRowBeforeSuccessor.systemName,
        laterSystemVersion: v3SystemVersion,
        laterContractVersion: directStableLaterRowBeforeSuccessor.version,
        laterCommandType: directStableLaterRowBeforeSuccessor.commandType,
        laterAccountId: directStableLaterRowBeforeSuccessor.accountId,
        laterAccountName: directStableLaterRowBeforeSuccessor.accountName,
        laterFrontendName: directStableLaterRowBeforeSuccessor.frontendName,
        laterActorId: directStableLaterRowBeforeSuccessor.actorId,
        laterActorName: directStableLaterRowBeforeSuccessor.actorName,
        laterSessionId: directStableLaterRowBeforeSuccessor.sessionId,
        laterStatus: directStableLaterRowBeforeSuccessor.status,
        laterStagedCursor: directStableLaterRowBeforeSuccessor.stagedCursor,
        laterStagedAt: directStableLaterRowBeforeSuccessor.stagedAt,
        laterPushedCursor: directStableLaterRowBeforeSuccessor.pushedCursor,
      });

    directStableSession.store.setState({ isPushPaused: false });

    // 6 — the stable controller/spec is byte-identical in v2 and v3. Both
    // worker and direct paths replace the same main-thread DB object at target
    // state, settle all live staged commands, converge to the same
    // server-ordered resource value, and advance across one boundary.
    await expect
      .poll(
        () => {
          const persistentState = stableSession.store.getState();
          const directState = directStableSession.store.getState();
          if (!persistentState.isInitialized || !directState.isInitialized) {
            return {
              persistentInitialized: persistentState.isInitialized,
              persistentStatus: persistentState.workerState.status,
              persistentFailure: persistentState.workerState.failure,
              directInitialized: directState.isInitialized,
              directStatus: directState.workerState.status,
              directFailure: directState.workerState.failure,
            };
          }
          const persistentQuery = persistentState.db.query.transitionUser;
          const directQuery = directState.db.query.transitionUser;
          if (persistentQuery === undefined || directQuery === undefined) {
            return null;
          }
          const persistentNote = persistentQuery
            .findFirst({
              where: {
                id: { eq: TransitionUserV1.prefixId(clerkUserId) },
              },
            })
            .sync()?.note;
          const directNote = directQuery
            .findFirst({
              where: {
                id: { eq: TransitionUserV1.prefixId(clerkUserId) },
              },
            })
            .sync()?.note;
          return {
            persistentInitialized: persistentState.isInitialized,
            persistentStatus: persistentState.workerState.status,
            persistentFailure: persistentState.workerState.failure,
            persistentGeneration: persistentState.generationId,
            persistentDbIsSame:
              persistentState.db === v2StableStateBeforeSuccessor.db,
            persistentCommandExecuted: persistentState.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .all()
              .some(command => command.id === stagedPersistentStable.right.id),
            directCommandExecuted: persistentState.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .all()
              .some(command => command.id === stagedDirectStable.right.id),
            laterDirectCommandExecuted: persistentState.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .all()
              .some(
                command => command.id === stagedDirectStableLater.right.id,
              ),
            notesConverged:
              persistentNote !== undefined && persistentNote === directNote,
            noteCameFromSettledCommand:
              persistentNote === persistentStableNote ||
              persistentNote === directStableNote ||
              persistentNote === directStableLaterNote,
            persistentFrontendIndex: persistentState.frontendIndex,
            directGeneration: directState.generationId,
            directInitialized: directState.isInitialized,
            directDbIsSame: directState.db === directStableDatabase,
            directStatus: directState.workerState.status,
            directFailure: directState.workerState.failure,
          };
        },
        { interval: 100, timeout: 180_000 },
      )
      .toEqual({
        persistentInitialized: true,
        persistentStatus: 'online',
        persistentFailure: null,
        persistentGeneration: v3GenerationId,
        persistentDbIsSame: true,
        persistentCommandExecuted: true,
        directCommandExecuted: true,
        laterDirectCommandExecuted: true,
        notesConverged: true,
        noteCameFromSettledCommand: true,
        persistentFrontendIndex: expect.any(Number),
        directInitialized: true,
        directGeneration: v3GenerationId,
        directDbIsSame: true,
        directStatus: 'online',
        directFailure: null,
      });
    const stableStateAfterSuccessor = stableSession.store.getState();
    if (!stableStateAfterSuccessor.isInitialized) {
      throw new Error('Stable worker session must remain initialized');
    }
    expect(stableStateAfterSuccessor.frontendIndex).toBeGreaterThan(
      v2StableFrontendIndex,
    );
    const v3DiagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(
      root =>
        root.partitionKey === partitionKey &&
        root.generationId === v3GenerationId,
    );
    if (v3DiagnosticRoot === undefined) {
      throw new Error('Expected the v3 transition Config diagnostic root');
    }

    // The changed v2 account and service controllers remain readable but
    // suspended. Their exact source databases are intact, the account keeps its
    // dormant command, and both direct v2 instances reject v3 state through the
    // explicit update requirement instead of running stale code over it.
    await expect
      .poll(
        () => ({
          shared: webV2Session.store.getState().workerState.status,
          direct: directWebV2Session.store.getState().workerState.status,
          service: catalogV2Session.store.getState().workerState.status,
          directService:
            directCatalogV2Session.store.getState().workerState.status,
        }),
        { interval: 100, timeout: 180_000 },
      )
      .toEqual({
        shared: 'update-required',
        direct: 'update-required',
        service: 'update-required',
        directService: 'update-required',
      });
    const suspendedWebState = webV2Session.store.getState();
    if (!suspendedWebState.isInitialized) {
      throw new Error('Suspended v2 web session must remain readable');
    }
    expect(suspendedWebState.db).toBe(v2WebDatabase);
    expect(
      suspendedWebState.db
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .all()
        .map(command => command.id),
    ).toContain(stagedV2CommandId);
    const suspendedWebQuery = suspendedWebState.db.query.transitionUser;
    if (suspendedWebQuery === undefined) {
      throw new Error('Suspended v2 web User query is missing');
    }
    expect(
      suspendedWebQuery
        .findFirst({
          where: { id: { eq: TransitionUserV1.prefixId(clerkUserId) } },
        })
        .sync()?.name,
    ).toBe(`v2:${successorDormantLabel}`);
    const suspendedCatalogState = catalogV2Session.store.getState();
    if (!suspendedCatalogState.isInitialized) {
      throw new Error('Suspended v2 service session must remain readable');
    }
    expect(suspendedCatalogState.db).toBe(catalogV2Database);
    expect(
      suspendedCatalogState.db.query.transitionProduct
        ?.findMany()
        .sync()
        .map(product => product.name),
    ).toContain('Transition fixture product');
    const suspendedDirectWebState = directWebV2Session.store.getState();
    const suspendedDirectCatalogState = directCatalogV2Session.store.getState();
    if (
      !suspendedDirectWebState.isInitialized ||
      !suspendedDirectCatalogState.isInitialized
    ) {
      throw new Error('Suspended direct v2 sessions must remain readable');
    }
    expect(suspendedDirectWebState.db).toBe(directWebV2Database);
    expect(suspendedDirectCatalogState.db).toBe(directCatalogV2Database);
    expect(
      suspendedDirectWebState.db.query.transitionUser
        ?.findFirst({
          where: { id: { eq: TransitionUserV1.prefixId(clerkUserId) } },
        })
        .sync()?.name,
    ).toBe(`v2:${sameGenerationDormantLabel}`);
    expect(
      suspendedDirectCatalogState.db.query.transitionProduct
        ?.findMany()
        .sync()
        .map(product => product.name),
    ).toContain('Transition fixture product');

    // 7 — point the same live Config at matching v3 controllers, commission
    // both targets, and keep the old v2 account/service Providers mounted
    // during preparation.
    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV3,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV3,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV2.Provider, {
                key: 'provider-web',
                ref: webV2Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV2.Provider, {
                    ref: catalogV2Ref,
                    children: createElement('div', null, 'v3 commissioning'),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });
    if (
      webV3CommissionActions === null ||
      catalogV3CommissionActions === null
    ) {
      throw new Error('v3 commission hooks did not render');
    }
    expect(Either.isRight(await webV3CommissionActions.commission())).toBe(
      true,
    );
    expect(Either.isRight(await catalogV3CommissionActions.commission())).toBe(
      true,
    );
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listAccountFrontendReplicas()),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listServiceFrontendReplicas()),
          );
          const webV3 = accountRows.find(
            row =>
              row.frontendName === 'web' && row.frontendVersion === '3.0.0',
          );
          const catalogV3 = serviceRows.find(
            row =>
              row.frontendName === 'catalog' && row.frontendVersion === '3.0.0',
          );
          return {
            webRole: webV3?.role,
            webSocket: webV3?.socketState,
            serviceRole: catalogV3?.role,
            serviceSocket: catalogV3?.socketState,
          };
        },
        { interval: 100, timeout: 180_000 },
      )
      .toEqual({
        webRole: 'commissioned',
        webSocket: 'online',
        serviceRole: 'commissioned',
        serviceSocket: 'online',
      });

    // Commissioning streamed target state but never executed the v2 source
    // journal. The readable source still owns that exact command ID.
    expect(
      v2WebDatabase
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .all()
        .map(command => command.id),
    ).toContain(stagedV2CommandId);

    const commissionedServiceRows = await Effect.runPromise(
      decodeRpc(await v3DiagnosticRoot.listServiceFrontendReplicas()),
    );
    const commissionedServiceV3 = commissionedServiceRows.find(
      row => row.frontendName === 'catalog' && row.frontendVersion === '3.0.0',
    );
    if (commissionedServiceV3 === undefined) {
      throw new Error('Expected commissioned v3 service row');
    }
    const commissionedServiceDatabaseName = commissionedServiceV3.databaseName;
    expect(Either.isRight(await catalogV3CommissionActions.release())).toBe(
      true,
    );
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listServiceFrontendReplicas()),
          );
          return rows.find(
            row =>
              row.frontendName === 'catalog' && row.frontendVersion === '3.0.0',
          );
        },
        { interval: 100, timeout: 60_000 },
      )
      .toEqual(
        expect.objectContaining({
          databaseName: commissionedServiceDatabaseName,
          socketState: 'disconnected',
        }),
      );

    // Recommission the retained service bytes so matching refreshed code can
    // activate them. No second database is created.
    expect(Either.isRight(await catalogV3CommissionActions.commission())).toBe(
      true,
    );
    await expect
      .poll(
        async () => {
          const rows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listServiceFrontendReplicas()),
          );
          return rows.find(
            row =>
              row.frontendName === 'catalog' && row.frontendVersion === '3.0.0',
          );
        },
        { interval: 100, timeout: 60_000 },
      )
      .toEqual(
        expect.objectContaining({
          databaseName: commissionedServiceDatabaseName,
          socketState: 'online',
        }),
      );

    // 8 — matching v3 Providers activate the already-current target replicas.
    // Web directly adapts v2 payload bytes, commits target journal/materialized
    // state first, then releases the source. Service switches without a journal.
    await act(async () => {
      mainRoot.render(
        createElement(ZerospinConfig, {
          partitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV3,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            stable: {
              frontend: ReactStable,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV3,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV2CommissionProbe, { key: 'commission-web-v2' }),
              createElement(WebV3CommissionProbe, { key: 'commission-web-v3' }),
              createElement(CatalogV3CommissionProbe, {
                key: 'commission-catalog-v3',
              }),
              createElement(ReactWebV3.Provider, {
                key: 'provider-web',
                ref: webV3Ref,
                children: createElement(ReactStable.Provider, {
                  ref: stableRef,
                  children: createElement(ReactCatalogV3.Provider, {
                    ref: catalogV3Ref,
                    children: createElement('div', null, 'v3 active'),
                  }),
                }),
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () => {
          const webState = webV3Ref.current?.session.store.getState();
          const serviceState = catalogV3Ref.current?.session.store.getState();
          if (
            webState === undefined ||
            !webState.isInitialized ||
            serviceState === undefined ||
            !serviceState.isInitialized
          ) {
            return null;
          }
          const query = webState.db.query.transitionUser;
          if (query === undefined) return null;
          return {
            webGeneration: webState.generationId,
            webStatus: webState.workerState.status,
            name: query
              .findFirst({
                where: {
                  id: { eq: TransitionUserV1.prefixId(clerkUserId) },
                },
              })
              .sync()?.name,
            executed: webState.db
              .select()
              .from(sessionExecutedPushedCommandDrizzleSchema)
              .all()
              .map(command => command.id),
            serviceGeneration: serviceState.generationId,
            serviceStatus: serviceState.workerState.status,
            serviceDatabaseName: serviceState.workerState.databaseName,
          };
        },
        { interval: 100, timeout: 180_000 },
      )
      .toEqual({
        webGeneration: v3GenerationId,
        webStatus: 'online',
        name: `v3:from-v2:${successorDormantLabel}`,
        executed: expect.arrayContaining([stagedV2CommandId]),
        serviceGeneration: v3GenerationId,
        serviceStatus: 'online',
        serviceDatabaseName: commissionedServiceDatabaseName,
      });

    await expect
      .poll(
        async () => {
          const sourceAccountRows = await Effect.runPromise(
            decodeRpc(await diagnosticRoot.listAccountFrontendReplicas()),
          );
          const targetAccountRows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listAccountFrontendReplicas()),
          );
          const source = sourceAccountRows.find(
            row =>
              row.frontendName === 'web' && row.frontendVersion === '2.0.0',
          );
          const target = targetAccountRows.find(
            row =>
              row.frontendName === 'web' && row.frontendVersion === '3.0.0',
          );
          return {
            sourceProviders: source?.activeProviderCount,
            sourceDatabaseName: source?.databaseName,
            targetRole: target?.role,
            targetProviders: target?.activeProviderCount,
            targetSocket: target?.socketState,
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        sourceProviders: 0,
        sourceDatabaseName: expect.any(String),
        targetRole: 'active',
        targetProviders: expect.any(Number),
        targetSocket: 'online',
      });

    // Release the v3 commission owner while the active Provider still owns the
    // target. Its socket must remain online. The service behaves identically.
    expect(Either.isRight(await webV3CommissionActions.release())).toBe(true);
    expect(Either.isRight(await catalogV3CommissionActions.release())).toBe(
      true,
    );
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listAccountFrontendReplicas()),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(await v3DiagnosticRoot.listServiceFrontendReplicas()),
          );
          return {
            web: accountRows.find(
              row =>
                row.frontendName === 'web' && row.frontendVersion === '3.0.0',
            )?.socketState,
            service: serviceRows.find(
              row =>
                row.frontendName === 'catalog' &&
                row.frontendVersion === '3.0.0',
            )?.socketState,
          };
        },
        { interval: 100, timeout: 60_000 },
      )
      .toEqual({ web: 'online', service: 'online' });

    // 9 — direct v2 account and service never install v3 through mismatched
    // controllers. Their old database views remain readable in update-required;
    // replacing both pages with v3 code performs ordinary direct bootstraps.
    const directWebV2State = directWebV2Session.store.getState();
    const directCatalogV2State = directCatalogV2Session.store.getState();
    if (
      !directWebV2State.isInitialized ||
      !directCatalogV2State.isInitialized
    ) {
      throw new Error('Direct v2 account and service must remain readable');
    }
    expect(directWebV2State.db).toBe(directWebV2Database);
    expect(directWebV2State.generationId).toBe(v1GenerationId);
    expect(directWebV2State.workerState.status).toBe('update-required');
    expect(directCatalogV2State.db).toBe(directCatalogV2Database);
    expect(directCatalogV2State.generationId).toBe(v1GenerationId);
    expect(directCatalogV2State.workerState.status).toBe('update-required');

    await act(async () => {
      directWebRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-web`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV3,
              generateSignature: () => Effect.succeed({ clerkUserId }),
            },
          },
          children: createElement(ReactWebV3.Provider, {
            ref: directWebV3Ref,
            children: createElement('div', null, 'direct web v3'),
          }),
        }),
      );
      directCatalogRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: `${partitionKey}-direct-catalog`,
          isSharedWorkerEnabled: false,
          frontendAuthenticators: {
            catalog: {
              frontend: ReactCatalogV3,
              generateSignature: () =>
                Effect.succeed({ viewerId: catalogViewerId }),
            },
          },
          children: createElement(ReactCatalogV3.Provider, {
            ref: directCatalogV3Ref,
            children: createElement('div', null, 'direct catalog v3'),
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () => {
          const state = directWebV3Ref.current?.session.store.getState();
          const serviceState =
            directCatalogV3Ref.current?.session.store.getState();
          if (
            state === undefined ||
            !state.isInitialized ||
            serviceState === undefined ||
            !serviceState.isInitialized
          ) {
            return null;
          }
          const query = state.db.query.transitionUser;
          const serviceQuery = serviceState.db.query.transitionProduct;
          if (query === undefined || serviceQuery === undefined) return null;
          return {
            accountGenerationId: state.generationId,
            accountStatus: state.workerState.status,
            accountDatabaseIsNew: state.db !== directWebV2Database,
            accountDatabaseName: state.workerState.databaseName,
            accountReplicaIndex: state.workerState.replicaIndex,
            accountName: query
              .findFirst({
                where: {
                  id: { eq: TransitionUserV1.prefixId(clerkUserId) },
                },
              })
              .sync()?.name,
            serviceGenerationId: serviceState.generationId,
            serviceStatus: serviceState.workerState.status,
            serviceDatabaseIsNew: serviceState.db !== directCatalogV2Database,
            serviceDatabaseName: serviceState.workerState.databaseName,
            serviceReplicaIndex: serviceState.workerState.replicaIndex,
            serviceProducts: serviceQuery
              .findMany()
              .sync()
              .map(product => product.name),
          };
        },
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({
        accountGenerationId: v3GenerationId,
        accountStatus: 'online',
        accountDatabaseIsNew: true,
        accountDatabaseName: null,
        accountReplicaIndex: null,
        accountName: `v3:from-v2:${successorDormantLabel}`,
        serviceGenerationId: v3GenerationId,
        serviceStatus: 'online',
        serviceDatabaseIsNew: true,
        serviceDatabaseName: null,
        serviceReplicaIndex: null,
        serviceProducts: expect.arrayContaining(['Transition fixture product']),
      });

    // Config teardown drops every Provider/commission registration. The rows
    // and VFS names remain retained while all sockets become disconnected.
    const retainedAccountRows = await Effect.runPromise(
      decodeRpc(await v3DiagnosticRoot.listAccountFrontendReplicas()),
    );
    const retainedServiceRows = await Effect.runPromise(
      decodeRpc(await v3DiagnosticRoot.listServiceFrontendReplicas()),
    );
    const retainedWebV3Database = retainedAccountRows.find(
      row => row.frontendName === 'web' && row.frontendVersion === '3.0.0',
    )?.databaseName;
    const retainedCatalogV3Database = retainedServiceRows.find(
      row => row.frontendName === 'catalog' && row.frontendVersion === '3.0.0',
    )?.databaseName;
    expect(retainedWebV3Database).toEqual(expect.any(String));
    expect(retainedCatalogV3Database).toBe(commissionedServiceDatabaseName);

    await act(async () => {
      mainRoot.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(mainRoot);
    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).filter(root => root.partitionKey === partitionKey).length,
        { interval: 100, timeout: 60_000 },
      )
      .toBe(0);
  });

  it('recovers interrupted account and service commissioning under their distinct byte-retention policies', async () => {
    /*
     * 1. Create real v3 account and service replicas, then stage one account
     *    command while the real server is offline so the separate partition
     *    journal owns the only durable command bytes.
     * 2. Release every browser owner and directly mark the real catalog rows
     *    as interrupted commissioning. This is test fault injection against
     *    the actual IDB-backed partition database, not a runtime debug API.
     * 3. Restart the real v3 deployment and commission both controllers.
     * 4. Prove account recovery verifies one unambiguous journal owner and
     *    reuses the same database, while service recovery preserves the failed
     *    row and creates a different ready database.
     * 5. Reopen the retained failed service VFS and read its product table,
     *    proving the failed catalog row still points at preserved bytes.
     */
    const ensureV3 = await fetch('/__transition-control/start/v3', {
      method: 'POST',
    });
    expect(ensureV3.status, await ensureV3.text()).toBe(204);
    globalThis.dispatchEvent(new Event('online'));
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('/__zerospin/ready')).status;
          } catch {
            return 0;
          }
        },
        { interval: 100, timeout: 120_000 },
      )
      .toBe(204);

    const interruptionPartitionKey = `transition-interrupted-${testRunId}`;
    const interruptionClerkUserId = `transition-interrupted-user-${testRunId}`;
    const interruptionCatalogViewerId = `transition-interrupted-catalog-${testRunId}`;
    const initialContainer = document.createElement('div');
    document.body.appendChild(initialContainer);
    mountedContainers.add(initialContainer);
    const initialRoot = createRoot(initialContainer);
    mountedRoots.add(initialRoot);
    const initialAccountRef =
      createRef<ComponentRef<typeof ReactWebV3.Provider>>();
    const initialServiceRef =
      createRef<ComponentRef<typeof ReactCatalogV3.Provider>>();

    await act(async () => {
      initialRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: interruptionPartitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV3,
              generateSignature: () =>
                Effect.succeed({ clerkUserId: interruptionClerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV3,
              generateSignature: () =>
                Effect.succeed({ viewerId: interruptionCatalogViewerId }),
            },
          },
          children: createElement(ReactWebV3.Provider, {
            ref: initialAccountRef,
            children: createElement(ReactCatalogV3.Provider, {
              ref: initialServiceRef,
              children: createElement(
                'div',
                null,
                'interruption source replicas',
              ),
            }),
          }),
        }),
      );
      await Promise.resolve();
    });

    await expect
      .poll(
        () => ({
          account:
            initialAccountRef.current?.session.store.getState().isInitialized ??
            false,
          service:
            initialServiceRef.current?.session.store.getState().isInitialized ??
            false,
        }),
        { interval: 100, timeout: 120_000 },
      )
      .toEqual({ account: true, service: true });

    const initialAccountSession = initialAccountRef.current?.session;
    const initialServiceSession = initialServiceRef.current?.session;
    if (
      initialAccountSession === undefined ||
      initialServiceSession === undefined
    ) {
      throw new Error('Interruption source Providers did not expose sessions');
    }
    const initialAccountState = initialAccountSession.store.getState();
    const initialServiceState = initialServiceSession.store.getState();
    if (
      !initialAccountState.isInitialized ||
      !initialServiceState.isInitialized
    ) {
      throw new Error('Interruption source sessions must initialize');
    }
    const interruptionSystemId = initialAccountState.systemId;
    const interruptionGenerationId = initialAccountState.generationId;
    expect(initialServiceState.generationId).toBe(interruptionGenerationId);

    // Reuse the exact WASM asset URL already emitted into this live worker's
    // identity-bearing URL. This keeps the raw inspection on the same browser
    // asset as production without adding a second Vite asset-import contract.
    const { cdp } = await import('vitest/browser');
    const interruptionTargets = await cdp().send('Target.getTargets');
    const interruptionSharedWorkerTarget = interruptionTargets.targetInfos.find(
      target => {
        if (target.type !== 'shared_worker') {
          return false;
        }
        const targetUrl = new URL(target.url);
        return (
          targetUrl.searchParams.get('systemId') === interruptionSystemId &&
          targetUrl.searchParams.get('generationId') ===
            interruptionGenerationId
        );
      },
    );
    if (interruptionSharedWorkerTarget === undefined) {
      throw new Error(
        'Chromium did not expose the exact interruption SharedWorker target',
      );
    }
    const interruptionWaSqliteWasmUrl = new URL(
      interruptionSharedWorkerTarget.url,
    ).searchParams.get('wasmUrl');
    if (
      interruptionWaSqliteWasmUrl === null ||
      interruptionWaSqliteWasmUrl.length === 0
    ) {
      throw new Error(
        'The interruption SharedWorker target did not expose its WASM URL',
      );
    }

    const interruptionDiagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === interruptionPartitionKey);
    if (interruptionDiagnosticRoot === undefined) {
      throw new Error('Expected interruption fixture diagnostic root');
    }
    const initialAccountRows = await Effect.runPromise(
      decodeRpc(await interruptionDiagnosticRoot.listAccountFrontendReplicas()),
    );
    const initialServiceRows = await Effect.runPromise(
      decodeRpc(await interruptionDiagnosticRoot.listServiceFrontendReplicas()),
    );
    const initialAccountRow = initialAccountRows.find(
      row => row.frontendName === 'web' && row.frontendVersion === '3.0.0',
    );
    const initialServiceRow = initialServiceRows.find(
      row => row.frontendName === 'catalog' && row.frontendVersion === '3.0.0',
    );
    if (initialAccountRow === undefined || initialServiceRow === undefined) {
      throw new Error('Expected initial account and service replica rows');
    }
    const interruptedAccountDatabaseName = initialAccountRow.databaseName;
    const interruptedServiceDatabaseName = initialServiceRow.databaseName;
    const accountDatabaseSeparator =
      interruptedAccountDatabaseName.indexOf('/');
    const serviceDatabaseSeparator =
      interruptedServiceDatabaseName.indexOf('/');
    if (accountDatabaseSeparator < 1 || serviceDatabaseSeparator < 1) {
      throw new Error('Replica diagnostic database names must include row IDs');
    }
    const interruptedAccountReplicaId = interruptedAccountDatabaseName.slice(
      0,
      accountDatabaseSeparator,
    );
    const interruptedServiceReplicaId = interruptedServiceDatabaseName.slice(
      0,
      serviceDatabaseSeparator,
    );
    const interruptedServiceFileName = interruptedServiceDatabaseName.slice(
      serviceDatabaseSeparator + 1,
    );

    // The account command is staged only after the socket is observably down.
    // Its full encoded command and mutations therefore remain in the separate
    // partition journal while the account replica is later fault-injected.
    const stopV3 = await fetch('/__transition-control/stop', {
      method: 'POST',
    });
    expect(stopV3.status).toBe(204);
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(
              await interruptionDiagnosticRoot.listAccountFrontendReplicas(),
            ),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(
              await interruptionDiagnosticRoot.listServiceFrontendReplicas(),
            ),
          );
          return {
            account: accountRows.find(
              row =>
                row.frontendName === 'web' && row.frontendVersion === '3.0.0',
            )?.socketState,
            service: serviceRows.find(
              row =>
                row.frontendName === 'catalog' &&
                row.frontendVersion === '3.0.0',
            )?.socketState,
          };
        },
        { interval: 100, timeout: 60_000 },
      )
      .toEqual({ account: 'disconnected', service: 'disconnected' });

    const interruptedCommand = await initialAccountSession.stageCommand({
      contractName: 'renameTransitionUser',
      payload: {
        id: TransitionUserV1.prefixId(interruptionClerkUserId),
        title: `interrupted-${testRunId}`,
      },
    });
    expect(interruptedCommand._tag).toBe('Right');
    if (interruptedCommand._tag === 'Left') {
      throw new Error(interruptedCommand.left.message);
    }
    const interruptedCommandId = interruptedCommand.right.id;

    await act(async () => {
      initialRoot.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(initialRoot);
    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).some(root => root.partitionKey === interruptionPartitionKey),
        { interval: 100, timeout: 60_000 },
      )
      .toBe(false);

    // Config release has dropped every Provider capability and acquisition.
    // Chromium does not promise prompt collection of an otherwise idle
    // SharedWorker, so terminate this exact target to model the interrupted
    // worker whose durable bytes the remainder of this test recovers.
    const closedInterruptedWorker = await cdp().send('Target.closeTarget', {
      targetId: interruptionSharedWorkerTarget.targetId,
    });
    expect(closedInterruptedWorker.success).toBe(true);
    await expect
      .poll(
        async () => {
          const targetsAfterInitialRelease =
            await cdp().send('Target.getTargets');
          return targetsAfterInitialRelease.targetInfos.some(
            target =>
              target.targetId === interruptionSharedWorkerTarget.targetId,
          );
        },
        { interval: 100, timeout: 60_000 },
      )
      .toBe(false);

    // Fault injection is deliberately performed by reopening the same physical
    // partition.db through wa-sqlite. Production has no mutation/debug RPC for
    // catalog state, and this test does not introduce one.
    const injectionModule = await SQLiteESMFactory({
      locateFile: () => interruptionWaSqliteWasmUrl,
    });
    const injectionSqlite = SQLite.Factory(injectionModule);
    const injectionVfs = new IDBBatchAtomicVFS(
      `zerospin/${interruptionSystemId}/${interruptionGenerationId}/partitions/${interruptionPartitionKey}`,
    );
    injectionVfs.mxPathName = 4096;
    Reflect.set(injectionVfs, 'Xc', 4096);
    Reflect.apply(injectionSqlite.vfs_register, injectionSqlite, [
      injectionVfs,
      false,
    ]);
    let injectionDb: number | null = null;
    try {
      injectionDb = await injectionSqlite.open_v2(
        'partition.db',
        SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
        injectionVfs.name,
      );
      const journalOwnersBeforeInjection = await injectionSqlite.execWithParams(
        injectionDb,
        'SELECT `commandId`, `frontendVersion`, `journalKind` FROM `accountFrontendCommandJournal` WHERE `commandId` = ?',
        [interruptedCommandId],
      );
      expect(journalOwnersBeforeInjection.rows).toEqual([
        [interruptedCommandId, '3.0.0', 'source'],
      ]);

      await injectionSqlite.run(injectionDb, 'BEGIN IMMEDIATE');
      try {
        await injectionSqlite.run(
          injectionDb,
          'UPDATE `accountFrontendReplicas` SET `status` = ?, `role` = ?, `journalHealth` = ?, `socketState` = ?, `updatedAt` = ? WHERE `id` = ?',
          [
            'commissioning',
            'commissioned',
            'unverified',
            'disconnected',
            Date.now(),
            interruptedAccountReplicaId,
          ],
        );
        await injectionSqlite.run(
          injectionDb,
          'UPDATE `serviceFrontendReplicas` SET `status` = ?, `role` = ?, `socketState` = ?, `updatedAt` = ? WHERE `id` = ?',
          [
            'commissioning',
            'commissioned',
            'disconnected',
            Date.now(),
            interruptedServiceReplicaId,
          ],
        );
        await injectionSqlite.run(injectionDb, 'COMMIT');
      } catch (error) {
        await injectionSqlite.run(injectionDb, 'ROLLBACK');
        throw error;
      }

      const injectedAccountRows = await injectionSqlite.execWithParams(
        injectionDb,
        'SELECT `status`, `role`, `journalHealth` FROM `accountFrontendReplicas` WHERE `id` = ?',
        [interruptedAccountReplicaId],
      );
      expect(injectedAccountRows.rows).toEqual([
        ['commissioning', 'commissioned', 'unverified'],
      ]);
      const injectedServiceRows = await injectionSqlite.execWithParams(
        injectionDb,
        'SELECT `status`, `role` FROM `serviceFrontendReplicas` WHERE `id` = ?',
        [interruptedServiceReplicaId],
      );
      expect(injectedServiceRows.rows).toEqual([
        ['commissioning', 'commissioned'],
      ]);
    } finally {
      if (injectionDb !== null) {
        await injectionSqlite.close(injectionDb);
      }
      await injectionVfs.close();
    }

    const restartV3 = await fetch('/__transition-control/start/v3', {
      method: 'POST',
    });
    expect(restartV3.status, await restartV3.text()).toBe(204);

    const webV3CommissionActionsBeforeRecovery = webV3CommissionActions;
    const catalogV3CommissionActionsBeforeRecovery = catalogV3CommissionActions;
    const recoveryContainer = document.createElement('div');
    document.body.appendChild(recoveryContainer);
    mountedContainers.add(recoveryContainer);
    const recoveryRoot = createRoot(recoveryContainer);
    mountedRoots.add(recoveryRoot);
    await act(async () => {
      recoveryRoot.render(
        createElement(ZerospinConfig, {
          partitionKey: interruptionPartitionKey,
          isSharedWorkerEnabled: true,
          frontendAuthenticators: {
            web: {
              frontend: ReactWebV3,
              generateSignature: () =>
                Effect.succeed({ clerkUserId: interruptionClerkUserId }),
            },
            catalog: {
              frontend: ReactCatalogV3,
              generateSignature: () =>
                Effect.succeed({ viewerId: interruptionCatalogViewerId }),
            },
          },
          children: createElement(Fragment, {
            children: [
              createElement(WebV3CommissionProbe, {
                key: 'recover-account-commission',
              }),
              createElement(CatalogV3CommissionProbe, {
                key: 'recover-service-commission',
              }),
            ],
          }),
        }),
      );
      await Promise.resolve();
    });
    await expect
      .poll(
        () =>
          webV3CommissionActions !== webV3CommissionActionsBeforeRecovery &&
          catalogV3CommissionActions !==
            catalogV3CommissionActionsBeforeRecovery,
        { interval: 50, timeout: 30_000 },
      )
      .toBe(true);
    const recoveredWebV3CommissionActions = webV3CommissionActions;
    const recoveredCatalogV3CommissionActions = catalogV3CommissionActions;
    if (
      recoveredWebV3CommissionActions === null ||
      recoveredCatalogV3CommissionActions === null
    ) {
      throw new Error('Interrupted recovery commission hooks did not render');
    }

    const recoveredAccountCommission =
      await recoveredWebV3CommissionActions.commission();
    if (recoveredAccountCommission._tag === 'Left') {
      throw new Error(JSON.stringify(recoveredAccountCommission.left));
    }
    expect(recoveredAccountCommission._tag).toBe('Right');
    const recoveredServiceCommission =
      await recoveredCatalogV3CommissionActions.commission();
    if (recoveredServiceCommission._tag === 'Left') {
      throw new Error(JSON.stringify(recoveredServiceCommission.left));
    }
    expect(recoveredServiceCommission._tag).toBe('Right');

    const recoveryDiagnosticRoot = Array.from(
      zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
    ).find(root => root.partitionKey === interruptionPartitionKey);
    if (recoveryDiagnosticRoot === undefined) {
      throw new Error('Expected interrupted recovery diagnostic root');
    }
    await expect
      .poll(
        async () => {
          const accountRows = await Effect.runPromise(
            decodeRpc(
              await recoveryDiagnosticRoot.listAccountFrontendReplicas(),
            ),
          );
          const serviceRows = await Effect.runPromise(
            decodeRpc(
              await recoveryDiagnosticRoot.listServiceFrontendReplicas(),
            ),
          );
          const account = accountRows.find(
            row =>
              row.frontendName === 'web' && row.frontendVersion === '3.0.0',
          );
          const failedService = serviceRows.find(
            row =>
              row.frontendName === 'catalog' &&
              row.frontendVersion === '3.0.0' &&
              row.status === 'failed',
          );
          const readyService = serviceRows.find(
            row =>
              row.frontendName === 'catalog' &&
              row.frontendVersion === '3.0.0' &&
              row.status === 'ready',
          );
          return {
            accountDatabaseName: account?.databaseName,
            accountStatus: account?.status,
            accountRole: account?.role,
            accountJournalHealth: account?.journalHealth,
            accountSocket: account?.socketState,
            failedServiceDatabaseName: failedService?.databaseName,
            failedServiceCode: failedService?.lastFailure?.code,
            readyServiceDatabaseName: readyService?.databaseName,
            readyServiceRole: readyService?.role,
            readyServiceSocket: readyService?.socketState,
          };
        },
        { interval: 100, timeout: 180_000 },
      )
      .toEqual({
        accountDatabaseName: interruptedAccountDatabaseName,
        accountStatus: 'ready',
        accountRole: 'commissioned',
        accountJournalHealth: 'healthy',
        accountSocket: 'online',
        failedServiceDatabaseName: interruptedServiceDatabaseName,
        failedServiceCode: 'interrupted-service-frontend-commission',
        readyServiceDatabaseName: expect.any(String),
        readyServiceRole: 'commissioned',
        readyServiceSocket: 'online',
      });
    const recoveredServiceRows = await Effect.runPromise(
      decodeRpc(await recoveryDiagnosticRoot.listServiceFrontendReplicas()),
    );
    const rebuiltServiceRow = recoveredServiceRows.find(
      row =>
        row.frontendName === 'catalog' &&
        row.frontendVersion === '3.0.0' &&
        row.status === 'ready',
    );
    if (rebuiltServiceRow === undefined) {
      throw new Error('Service recovery did not expose a rebuilt database');
    }
    const rebuiltServiceDatabaseName = rebuiltServiceRow.databaseName;
    expect(rebuiltServiceDatabaseName).not.toBe(interruptedServiceDatabaseName);

    const recoveryTargets = await cdp().send('Target.getTargets');
    const recoverySharedWorkerTarget = recoveryTargets.targetInfos.find(
      target => {
        if (target.type !== 'shared_worker') {
          return false;
        }
        const targetUrl = new URL(target.url);
        return (
          targetUrl.searchParams.get('systemId') === interruptionSystemId &&
          targetUrl.searchParams.get('generationId') ===
            interruptionGenerationId
        );
      },
    );
    if (recoverySharedWorkerTarget === undefined) {
      throw new Error(
        'Chromium did not expose the exact recovery SharedWorker target',
      );
    }

    expect((await recoveredWebV3CommissionActions.release())._tag).toBe(
      'Right',
    );
    expect((await recoveredCatalogV3CommissionActions.release())._tag).toBe(
      'Right',
    );
    await act(async () => {
      recoveryRoot.unmount();
      await Promise.resolve();
    });
    mountedRoots.delete(recoveryRoot);
    await expect
      .poll(
        () =>
          Array.from(
            zerospinDevtoolsStore.getState().sharedWorkerRootsById.values(),
          ).some(root => root.partitionKey === interruptionPartitionKey),
        { interval: 100, timeout: 60_000 },
      )
      .toBe(false);

    // The verification connection reopens the same partition.db bytes. End
    // the exact recovered worker explicitly after Config release so no
    // browser-GC timing assumption sits between recovery and byte inspection.
    const closedRecoveryWorker = await cdp().send('Target.closeTarget', {
      targetId: recoverySharedWorkerTarget.targetId,
    });
    expect(closedRecoveryWorker.success).toBe(true);
    await expect
      .poll(
        async () => {
          const targetsAfterRecoveryRelease =
            await cdp().send('Target.getTargets');
          return targetsAfterRecoveryRelease.targetInfos.some(
            target => target.targetId === recoverySharedWorkerTarget.targetId,
          );
        },
        { interval: 100, timeout: 60_000 },
      )
      .toBe(false);

    // Reopen partition.db after recovery. The command still has exactly one
    // journal owner, the account catalog kept its original DB name, and the new
    // service row records the failed physical database as retained history.
    const verificationModule = await SQLiteESMFactory({
      locateFile: () => interruptionWaSqliteWasmUrl,
    });
    const verificationSqlite = SQLite.Factory(verificationModule);
    const verificationVfs = new IDBBatchAtomicVFS(
      `zerospin/${interruptionSystemId}/${interruptionGenerationId}/partitions/${interruptionPartitionKey}`,
    );
    verificationVfs.mxPathName = 4096;
    Reflect.set(verificationVfs, 'Xc', 4096);
    Reflect.apply(verificationSqlite.vfs_register, verificationSqlite, [
      verificationVfs,
      false,
    ]);
    let verificationDb: number | null = null;
    try {
      verificationDb = await verificationSqlite.open_v2(
        'partition.db',
        SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
        verificationVfs.name,
      );
      const journalOwnersAfterRecovery =
        await verificationSqlite.execWithParams(
          verificationDb,
          'SELECT `commandId`, `frontendVersion`, `journalKind` FROM `accountFrontendCommandJournal` WHERE `commandId` = ?',
          [interruptedCommandId],
        );
      expect(journalOwnersAfterRecovery.rows).toEqual([
        [interruptedCommandId, '3.0.0', 'source'],
      ]);

      const accountAfterRecovery = await verificationSqlite.execWithParams(
        verificationDb,
        'SELECT `id`, `databaseName`, `status`, `journalHealth` FROM `accountFrontendReplicas` WHERE `id` = ?',
        [interruptedAccountReplicaId],
      );
      expect(accountAfterRecovery.rows).toEqual([
        [interruptedAccountReplicaId, 'replica.db', 'ready', 'healthy'],
      ]);

      const rebuiltServiceDatabaseSeparator =
        rebuiltServiceDatabaseName.indexOf('/');
      if (rebuiltServiceDatabaseSeparator < 1) {
        throw new Error(
          'Rebuilt service database name must include its row ID',
        );
      }
      const rebuiltServiceReplicaId = rebuiltServiceDatabaseName.slice(
        0,
        rebuiltServiceDatabaseSeparator,
      );
      const rebuiltServiceAfterRecovery =
        await verificationSqlite.execWithParams(
          verificationDb,
          'SELECT `previousDatabaseNames` FROM `serviceFrontendReplicas` WHERE `id` = ?',
          [rebuiltServiceReplicaId],
        );
      const encodedPreviousDatabaseNames =
        rebuiltServiceAfterRecovery.rows[0]?.[0];
      if (typeof encodedPreviousDatabaseNames !== 'string') {
        throw new Error('Rebuilt service retained-history bytes are missing');
      }
      expect(JSON.parse(encodedPreviousDatabaseNames)).toContain(
        interruptedServiceDatabaseName,
      );
    } finally {
      if (verificationDb !== null) {
        await verificationSqlite.close(verificationDb);
      }
      await verificationVfs.close();
    }

    // The failed row is not merely historical metadata. Its original VFS and
    // replica.db remain readable and still contain the seeded service resource.
    const retainedServiceModule = await SQLiteESMFactory({
      locateFile: () => interruptionWaSqliteWasmUrl,
    });
    const retainedServiceSqlite = SQLite.Factory(retainedServiceModule);
    const retainedServiceVfs = new IDBBatchAtomicVFS(
      `zerospin/${interruptionSystemId}/${interruptionGenerationId}/partitions/${interruptionPartitionKey}/service/${interruptedServiceReplicaId}`,
    );
    retainedServiceVfs.mxPathName = 4096;
    Reflect.set(retainedServiceVfs, 'Xc', 4096);
    Reflect.apply(retainedServiceSqlite.vfs_register, retainedServiceSqlite, [
      retainedServiceVfs,
      false,
    ]);
    let retainedServiceDb: number | null = null;
    try {
      retainedServiceDb = await retainedServiceSqlite.open_v2(
        interruptedServiceFileName,
        SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
        retainedServiceVfs.name,
      );
      const retainedProducts = await retainedServiceSqlite.execWithParams(
        retainedServiceDb,
        'SELECT COUNT(*) FROM `transitionProduct`',
      );
      expect(retainedProducts.rows[0]?.[0]).toBeGreaterThan(0);
    } finally {
      if (retainedServiceDb !== null) {
        await retainedServiceSqlite.close(retainedServiceDb);
      }
      await retainedServiceVfs.close();
    }
  });
});
