import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { Effect, Either, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBrowserPartitionController } from './makeBrowserPartitionController';

const accountFrontendV1 = makeFrontendController({
  systemName: 'cache-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const accountFrontendV2 = makeFrontendController({
  systemName: 'cache-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '2.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const serviceFrontend = makeServiceFrontendController({
  systemName: 'cache-system',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog-web',
  version: '1.0.0',
  models: {},
  signature: Schema.Struct({ viewerId: Schema.String }),
});

let storageValues: Map<string, string>;

beforeEach(() => {
  storageValues = new Map();
  vi.stubGlobal('localStorage', {
    get length() {
      return storageValues.size;
    },
    clear() {
      storageValues.clear();
    },
    getItem(key) {
      return storageValues.get(key) ?? null;
    },
    key(index) {
      return [...storageValues.keys()][index] ?? null;
    },
    removeItem(key) {
      storageValues.delete(key);
    },
    setItem(key, value) {
      storageValues.set(key, value);
    },
  } satisfies Storage);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('makeBrowserPartitionController locator cache', () => {
  it('persists only bounded account identity and expires at exactly 24 hours', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition-cache',
      getFrontendAuthenticator: () => undefined,
    });

    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test/path',
      publishableKey: 'pk_test',
      frontend: accountFrontendV1,
      role: 'active',
      identity: {
        systemName: accountFrontendV1.systemName,
        accountName: accountFrontendV1.accountName,
        accountId: 'acct_cache-account',
        actorName: accountFrontendV1.actorName,
        actorId: 'actr_cache-actor',
        frontendName: accountFrontendV1.frontendName,
        frontendVersion: accountFrontendV1.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '1.0.0',
        systemWorkerName: 'cache-worker',
      },
    });

    const cached = controller.getCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test/other-path',
      publishableKey: 'pk_test',
      frontend: accountFrontendV1,
      role: 'active',
    });
    expect(cached?.authenticatedAt).toBe(1_000);
    expect(cached?.expiresAt).toBe(86_401_000);
    const persisted = [...storageValues.values()].join('');
    expect(persisted).not.toContain('signature');
    expect(persisted).not.toContain('ticket');
    expect(persisted).not.toContain('command');

    vi.spyOn(Date, 'now').mockReturnValue(86_401_000);
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: accountFrontendV1,
        role: 'active',
      }),
    ).toBeNull();
  });

  it('promotes commissioned account and service locators without extending authentication expiry', () => {
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition-promotion',
      getFrontendAuthenticator: () => undefined,
    });

    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: accountFrontendV2,
      role: 'commissioned',
      identity: {
        systemName: accountFrontendV2.systemName,
        accountName: accountFrontendV2.accountName,
        accountId: 'acct_cache-account',
        actorName: accountFrontendV2.actorName,
        actorId: 'actr_cache-actor',
        frontendName: accountFrontendV2.frontendName,
        frontendVersion: accountFrontendV2.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '2.0.0',
        systemWorkerName: 'cache-worker',
      },
    });
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: serviceFrontend,
      role: 'commissioned',
      identity: {
        systemName: serviceFrontend.systemName,
        serviceName: serviceFrontend.serviceName,
        actorName: serviceFrontend.actorName,
        actorId: 'actr_cache-viewer',
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '2.0.0',
        systemWorkerName: 'cache-worker',
      },
    });

    vi.spyOn(Date, 'now').mockReturnValue(20_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: accountFrontendV2,
      role: 'active',
      identity: {
        systemName: accountFrontendV2.systemName,
        accountName: accountFrontendV2.accountName,
        accountId: 'acct_cache-account',
        actorName: accountFrontendV2.actorName,
        actorId: 'actr_cache-actor',
        frontendName: accountFrontendV2.frontendName,
        frontendVersion: accountFrontendV2.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '2.0.0',
        systemWorkerName: 'cache-worker',
      },
    });
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: serviceFrontend,
      role: 'active',
      identity: {
        systemName: serviceFrontend.systemName,
        serviceName: serviceFrontend.serviceName,
        actorName: serviceFrontend.actorName,
        actorId: 'actr_cache-viewer',
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '2.0.0',
        systemWorkerName: 'cache-worker',
      },
    });

    const activeAccount = controller.getCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: accountFrontendV2,
      role: 'active',
    });
    const activeService = controller.getCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: serviceFrontend,
      role: 'active',
    });
    expect(activeAccount?.authenticatedAt).toBe(10_000);
    expect(activeAccount?.expiresAt).toBe(86_410_000);
    expect(activeService?.authenticatedAt).toBe(10_000);
    expect(activeService?.expiresAt).toBe(86_410_000);
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: accountFrontendV2,
        role: 'commissioned',
      }),
    ).toBeNull();
    expect(
      controller.getCachedServiceFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: serviceFrontend,
        role: 'commissioned',
      }),
    ).toBeNull();
  });

  it('invalidates every account version while preserving service locators', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition-invalidate',
      getFrontendAuthenticator: () => undefined,
    });

    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: accountFrontendV1,
      role: 'active',
      identity: {
        systemName: accountFrontendV1.systemName,
        accountName: accountFrontendV1.accountName,
        accountId: 'acct_cache-account',
        actorName: accountFrontendV1.actorName,
        actorId: 'actr_cache-actor',
        frontendName: accountFrontendV1.frontendName,
        frontendVersion: accountFrontendV1.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '1.0.0',
        systemWorkerName: 'cache-worker',
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: accountFrontendV2,
      role: 'commissioned',
      identity: {
        systemName: accountFrontendV2.systemName,
        accountName: accountFrontendV2.accountName,
        accountId: 'acct_cache-account',
        actorName: accountFrontendV2.actorName,
        actorId: 'actr_cache-actor',
        frontendName: accountFrontendV2.frontendName,
        frontendVersion: accountFrontendV2.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '1.0.0',
        systemWorkerName: 'cache-worker',
      },
    });
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: serviceFrontend,
      role: 'active',
      identity: {
        systemName: serviceFrontend.systemName,
        serviceName: serviceFrontend.serviceName,
        actorName: serviceFrontend.actorName,
        actorId: 'actr_cache-viewer',
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        systemId: 'sys_cache-system',
        generationId: 'gen_cache-generation',
        systemVersion: '1.0.0',
        systemWorkerName: 'cache-worker',
      },
    });

    await Effect.runPromise(
      controller.invalidateCachedAccountFrontendLocators({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: accountFrontendV1,
      }),
    );

    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: accountFrontendV1,
        role: 'active',
      }),
    ).toBeNull();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: accountFrontendV2,
        role: 'commissioned',
      }),
    ).toBeNull();
    expect(
      controller.getCachedServiceFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: serviceFrontend,
        role: 'active',
      }),
    ).not.toBeNull();
  });

  it('deletes persisted locator state containing unknown fields', () => {
    const storageKey = 'zerospin:frontend-locators:partition-invalid';
    storageValues.set(
      storageKey,
      JSON.stringify({
        state: {
          locators: {},
          signature: 'must-not-survive',
        },
      }),
    );

    makeBrowserPartitionController({
      partitionKey: 'partition-invalid',
      getFrontendAuthenticator: () => undefined,
    });

    expect(storageValues.has(storageKey)).toBe(false);
  });

  it('fails explicitly when SharedWorker mode is requested but unavailable', async () => {
    vi.stubGlobal('SharedWorker', undefined);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition-no-worker',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });

    const result = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: accountFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_cache-system',
          generationId: 'gen_cache-generation',
          systemVersion: '1.0.0',
          accountId: 'acct_cache-account',
          accountName: accountFrontendV1.accountName,
          actorId: 'actr_cache-actor',
          actorName: accountFrontendV1.actorName,
          frontendName: accountFrontendV1.frontendName,
          frontendVersion: accountFrontendV1.version,
          frontendSpec: makeFrontendControllerSpec(accountFrontendV1),
          frontendSpecHash: 'hash',
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('failed-to-acquire-shared-worker-root');
      expect(result.left.cause).toContain('SharedWorker is not available');
    }
  });
});
