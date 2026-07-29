import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { Effect, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBrowserPartitionController } from './makeBrowserPartitionController';

const makeSharedWorkerSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/shared-worker/makeSharedWorkerSession', () => ({
  makeSharedWorkerSession: makeSharedWorkerSessionMock,
}));

const frontend = makeFrontendController({
  systemName: 'barrier-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const serviceFrontend = makeServiceFrontendController({
  systemName: 'barrier-system',
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
  makeSharedWorkerSessionMock.mockReset();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('makeBrowserPartitionController session barriers', () => {
  it('makes the fresh account network available during cached-offline reacquisition', async () => {
    const onlineEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      onlineEvents.addEventListener.bind(onlineEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      onlineEvents.removeEventListener.bind(onlineEvents),
    );
    const regainAccountTransport = vi.fn(async () => undefined);
    const authoritativeState = {
      accountId: 'acct_upgrade_account',
      accountName: frontend.accountName,
      actorId: 'actr_upgrade_account',
      actorName: frontend.actorName,
      systemId: 'sys_upgrade_account',
      generationId: 'gen_upgrade_account',
      systemVersion: '1.0.0',
      systemWorkerName: 'worker-upgrade-account',
      frontendName: frontend.frontendName,
      frontendIndex: 4,
      lastRebasedPushedCursor: null,
      pushedCommands: [],
      resources: [],
      executedPushedCommands: [],
      failedPushedCommands: [],
    };
    const getFrontendState = vi.fn(async () => encodeRight(authoritativeState));
    const releaseFrontendApi = vi.fn();
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 4,
          stagedCommands: [],
          systemWorkerName: 'worker-upgrade-account',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    let acquireCount = 0;
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async props => {
        acquireCount += 1;
        if (acquireCount === 2) {
          throw new Error('injected account authority upgrade failure');
        }
        if (acquireCount === 3) {
          const state = await Effect.runPromise(
            decodeRpc(await props.provider.getFrontendState()),
          );
          expect(state).toEqual(authoritativeState);
        }
        return encodeRight(acquiredApi);
      }),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: authoritativeState.accountId,
            accountName: authoritativeState.accountName,
            actorId: authoritativeState.actorId,
            actorName: authoritativeState.actorName,
            frontendName: authoritativeState.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'upgrade-account.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_cached_account_upgrade',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );

    const cachedOfflineAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: authoritativeState.systemId,
          generationId: authoritativeState.generationId,
          systemVersion: authoritativeState.systemVersion,
          accountId: authoritativeState.accountId,
          accountName: authoritativeState.accountName,
          actorId: authoritativeState.actorId,
          actorName: authoritativeState.actorName,
          frontendName: authoritativeState.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'cached-offline',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: regainAccountTransport,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    const firstSetOnline = vi.fn();
    const secondSetOnline = vi.fn();
    const firstHydration = await Effect.runPromise(
      cachedOfflineAcquisition.hydrateSession({
        sessionId: 'sesn_upgrade_account_first',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: firstSetOnline,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondHydration = await Effect.runPromise(
      cachedOfflineAcquisition.hydrateSession({
        sessionId: 'sesn_upgrade_account_second',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: secondSetOnline,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    // A failed worker upgrade must keep every mounted Provider offline.
    const failedUpgrade = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: authoritativeState.systemId,
          generationId: authoritativeState.generationId,
          systemVersion: authoritativeState.systemVersion,
          accountId: authoritativeState.accountId,
          accountName: authoritativeState.accountName,
          actorId: authoritativeState.actorId,
          actorName: authoritativeState.actorName,
          frontendName: authoritativeState.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: {
            getFrontendState,
            createFrontendWebSocketTicket: vi.fn(async () =>
              encodeRight({
                ticket: 'ticket-upgrade-account-failed',
                systemId: authoritativeState.systemId,
                generationId: authoritativeState.generationId,
                accountId: authoritativeState.accountId,
                accountName: authoritativeState.accountName,
                actorId: authoritativeState.actorId,
                actorName: authoritativeState.actorName,
                frontendName: authoritativeState.frontendName,
                frontendVersion: frontend.version,
              }),
            ),
            pushCommands: vi.fn(async () =>
              encodeRight({
                pendingCommands: [],
                pushedCommands: [],
                failedCommands: [],
              }),
            ),
            releaseFrontendApi,
          },
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.either),
    );

    expect(failedUpgrade._tag).toBe('Left');
    expect(firstSetOnline).not.toHaveBeenCalled();
    expect(secondSetOnline).not.toHaveBeenCalled();

    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: authoritativeState.systemId,
          generationId: authoritativeState.generationId,
          systemVersion: authoritativeState.systemVersion,
          accountId: authoritativeState.accountId,
          accountName: authoritativeState.accountName,
          actorId: authoritativeState.actorId,
          actorName: authoritativeState.actorName,
          frontendName: authoritativeState.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: {
            getFrontendState,
            createFrontendWebSocketTicket: vi.fn(async () =>
              encodeRight({
                ticket: 'ticket-upgrade-account',
                systemId: authoritativeState.systemId,
                generationId: authoritativeState.generationId,
                accountId: authoritativeState.accountId,
                accountName: authoritativeState.accountName,
                actorId: authoritativeState.actorId,
                actorName: authoritativeState.actorName,
                frontendName: authoritativeState.frontendName,
                frontendVersion: frontend.version,
              }),
            ),
            pushCommands: vi.fn(async () =>
              encodeRight({
                pendingCommands: [],
                pushedCommands: [],
                failedCommands: [],
              }),
            ),
            releaseFrontendApi,
          },
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    expect(partitionApi.acquireFrontendReplica).toHaveBeenCalledTimes(3);
    expect(getFrontendState).toHaveBeenCalledOnce();
    expect(firstSetOnline).toHaveBeenCalledOnce();
    expect(secondSetOnline).toHaveBeenCalledOnce();
    onlineEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() =>
      expect(regainAccountTransport).toHaveBeenCalledOnce(),
    );
    await Effect.runPromise(firstHydration.release);
    await Effect.runPromise(secondHydration.release);
    await controller.release();
    // One unadopted failed-upgrade capability and the later retained
    // capability are each released exactly once by the controller.
    expect(releaseFrontendApi).toHaveBeenCalledTimes(2);
  });

  it('makes the fresh service network available during cached-offline reacquisition', async () => {
    const onlineEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      onlineEvents.addEventListener.bind(onlineEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      onlineEvents.removeEventListener.bind(onlineEvents),
    );
    const regainServiceTransport = vi.fn(async () => undefined);
    const authoritativeState = {
      actorId: 'actr_upgrade_service',
      actorName: serviceFrontend.actorName,
      systemId: 'sys_upgrade_service',
      generationId: 'gen_upgrade_service',
      systemVersion: '1.0.0',
      systemWorkerName: 'worker-upgrade-service',
      serviceName: serviceFrontend.serviceName,
      frontendName: serviceFrontend.frontendName,
      frontendIndex: 7,
      resources: [],
    };
    const getFrontendState = vi.fn(async () => encodeRight(authoritativeState));
    const releaseFrontendApi = vi.fn();
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 7,
          systemWorkerName: 'worker-upgrade-service',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    let acquireCount = 0;
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(async props => {
        acquireCount += 1;
        if (acquireCount === 2) {
          throw new Error('injected service authority upgrade failure');
        }
        if (acquireCount === 3) {
          const state = await Effect.runPromise(
            decodeRpc(await props.provider.getFrontendState()),
          );
          expect(state).toEqual(authoritativeState);
        }
        return encodeRight(acquiredApi);
      }),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: authoritativeState.serviceName,
            actorId: authoritativeState.actorId,
            actorName: authoritativeState.actorName,
            frontendName: authoritativeState.frontendName,
            frontendVersion: serviceFrontend.version,
            databaseName: 'upgrade-service.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: null,
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_cached_service_upgrade',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeServiceFrontendControllerSpec(serviceFrontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );

    const cachedOfflineAcquisition = await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: authoritativeState.systemId,
        generationId: authoritativeState.generationId,
        systemVersion: authoritativeState.systemVersion,
        serviceName: authoritativeState.serviceName,
        actorId: authoritativeState.actorId,
        actorName: authoritativeState.actorName,
        frontendName: authoritativeState.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec,
        frontendSpecHash,
        authority: 'cached-offline',
        role: 'active',
        commissionOwnerId: null,
        network: null,
        transportRegain: regainServiceTransport,
      }),
    );

    const firstSetOnline = vi.fn();
    const secondSetOnline = vi.fn();
    const firstHydration = await Effect.runPromise(
      cachedOfflineAcquisition.hydrateSession({
        sessionId: 'sesn_upgrade_service_first',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: firstSetOnline,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondHydration = await Effect.runPromise(
      cachedOfflineAcquisition.hydrateSession({
        sessionId: 'sesn_upgrade_service_second',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: secondSetOnline,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    // A failed worker upgrade must keep every mounted Provider offline.
    const failedUpgrade = await Effect.runPromise(
      controller
        .acquireServiceFrontendReplica({
          frontend: serviceFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: authoritativeState.systemId,
          generationId: authoritativeState.generationId,
          systemVersion: authoritativeState.systemVersion,
          serviceName: authoritativeState.serviceName,
          actorId: authoritativeState.actorId,
          actorName: authoritativeState.actorName,
          frontendName: authoritativeState.frontendName,
          frontendVersion: serviceFrontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: {
            getFrontendState,
            createFrontendWebSocketTicket: vi.fn(async () =>
              encodeRight({
                ticket: 'ticket-upgrade-service-failed',
                systemId: authoritativeState.systemId,
                generationId: authoritativeState.generationId,
                serviceName: authoritativeState.serviceName,
                actorId: authoritativeState.actorId,
                actorName: authoritativeState.actorName,
                frontendName: authoritativeState.frontendName,
                frontendVersion: serviceFrontend.version,
              }),
            ),
            releaseFrontendApi,
          },
          transportRegain: null,
        })
        .pipe(Effect.either),
    );

    expect(failedUpgrade._tag).toBe('Left');
    expect(firstSetOnline).not.toHaveBeenCalled();
    expect(secondSetOnline).not.toHaveBeenCalled();

    await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: authoritativeState.systemId,
        generationId: authoritativeState.generationId,
        systemVersion: authoritativeState.systemVersion,
        serviceName: authoritativeState.serviceName,
        actorId: authoritativeState.actorId,
        actorName: authoritativeState.actorName,
        frontendName: authoritativeState.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec,
        frontendSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        network: {
          getFrontendState,
          createFrontendWebSocketTicket: vi.fn(async () =>
            encodeRight({
              ticket: 'ticket-upgrade-service',
              systemId: authoritativeState.systemId,
              generationId: authoritativeState.generationId,
              serviceName: authoritativeState.serviceName,
              actorId: authoritativeState.actorId,
              actorName: authoritativeState.actorName,
              frontendName: authoritativeState.frontendName,
              frontendVersion: serviceFrontend.version,
            }),
          ),
          releaseFrontendApi,
        },
        transportRegain: null,
      }),
    );

    expect(partitionApi.acquireServiceFrontendReplica).toHaveBeenCalledTimes(3);
    expect(getFrontendState).toHaveBeenCalledOnce();
    expect(firstSetOnline).toHaveBeenCalledOnce();
    expect(secondSetOnline).toHaveBeenCalledOnce();
    onlineEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() =>
      expect(regainServiceTransport).toHaveBeenCalledOnce(),
    );
    await Effect.runPromise(firstHydration.release);
    await Effect.runPromise(secondHydration.release);
    await controller.release();
    // The failed upgrade and the adopted retry are distinct Config
    // capabilities even though this test records them with one spy.
    expect(releaseFrontendApi).toHaveBeenCalledTimes(2);
  });

  it('encodes raw account provider transport rejections as typed Zerospin errors', async () => {
    const getFrontendState = vi.fn(async () => {
      throw new Error('injected account state transport failure');
    });
    const createFrontendWebSocketTicket = vi.fn(async () => {
      throw new Error('injected account ticket transport failure');
    });
    const pushCommands = vi.fn(async () => {
      throw new Error('injected account push transport failure');
    });
    const releaseFrontendApi = vi.fn();
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          stagedCommands: [],
          systemWorkerName: 'worker-account-provider-transport',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_account_provider_transport',
            accountName: frontend.accountName,
            actorId: 'actr_account_provider_transport',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'account-provider-transport.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_account_provider_transport',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_account_provider_transport',
          generationId: 'gen_account_provider_transport',
          systemVersion: '1.0.0',
          accountId: 'acct_account_provider_transport',
          accountName: frontend.accountName,
          actorId: 'actr_account_provider_transport',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: {
            getFrontendState,
            createFrontendWebSocketTicket,
            pushCommands,
            releaseFrontendApi,
          },
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const provider =
      partitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Account transport provider capability was not registered');
    }

    const stateOutcome = await Effect.runPromise(
      decodeRpc(await provider.getFrontendState()).pipe(Effect.either),
    );
    expect(stateOutcome._tag).toBe('Left');
    if (stateOutcome._tag === 'Left') {
      expect(stateOutcome.left.code).toBe(
        'account-frontend-provider-state-transport-failed',
      );
    }

    const ticketOutcome = await Effect.runPromise(
      decodeRpc(await provider.createFrontendWebSocketTicket()).pipe(
        Effect.either,
      ),
    );
    expect(ticketOutcome._tag).toBe('Left');
    if (ticketOutcome._tag === 'Left') {
      expect(ticketOutcome.left.code).toBe(
        'account-frontend-provider-ticket-transport-failed',
      );
    }

    const pushOutcome = await Effect.runPromise(
      decodeRpc(await provider.pushCommands([])).pipe(Effect.either),
    );
    expect(pushOutcome._tag).toBe('Left');
    if (pushOutcome._tag === 'Left') {
      expect(pushOutcome.left.code).toBe(
        'account-frontend-provider-push-transport-failed',
      );
    }

    expect(getFrontendState).toHaveBeenCalledOnce();
    expect(createFrontendWebSocketTicket).toHaveBeenCalledOnce();
    expect(pushCommands).toHaveBeenCalledOnce();
    await controller.release();
    expect(releaseFrontendApi).toHaveBeenCalledOnce();
  });

  it('encodes raw service provider transport rejections as typed Zerospin errors', async () => {
    const getFrontendState = vi.fn(async () => {
      throw new Error('injected service state transport failure');
    });
    const createFrontendWebSocketTicket = vi.fn(async () => {
      throw new Error('injected service ticket transport failure');
    });
    const releaseFrontendApi = vi.fn();
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          systemWorkerName: 'worker-service-provider-transport',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight(acquiredApi),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: serviceFrontend.serviceName,
            actorId: 'actr_service_provider_transport',
            actorName: serviceFrontend.actorName,
            frontendName: serviceFrontend.frontendName,
            frontendVersion: serviceFrontend.version,
            databaseName: 'service-provider-transport.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: null,
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_service_provider_transport',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeServiceFrontendControllerSpec(serviceFrontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_service_provider_transport',
        generationId: 'gen_service_provider_transport',
        systemVersion: '1.0.0',
        serviceName: serviceFrontend.serviceName,
        actorId: 'actr_service_provider_transport',
        actorName: serviceFrontend.actorName,
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec,
        frontendSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        network: {
          getFrontendState,
          createFrontendWebSocketTicket,
          releaseFrontendApi,
        },
        transportRegain: null,
      }),
    );
    const provider =
      partitionApi.acquireServiceFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Service transport provider capability was not registered');
    }

    const stateOutcome = await Effect.runPromise(
      decodeRpc(await provider.getFrontendState()).pipe(Effect.either),
    );
    expect(stateOutcome._tag).toBe('Left');
    if (stateOutcome._tag === 'Left') {
      expect(stateOutcome.left.code).toBe(
        'service-frontend-provider-state-transport-failed',
      );
    }

    const ticketOutcome = await Effect.runPromise(
      decodeRpc(await provider.createFrontendWebSocketTicket()).pipe(
        Effect.either,
      ),
    );
    expect(ticketOutcome._tag).toBe('Left');
    if (ticketOutcome._tag === 'Left') {
      expect(ticketOutcome.left.code).toBe(
        'service-frontend-provider-ticket-transport-failed',
      );
    }

    expect(getFrontendState).toHaveBeenCalledOnce();
    expect(createFrontendWebSocketTicket).toHaveBeenCalledOnce();
    await controller.release();
    expect(releaseFrontendApi).toHaveBeenCalledOnce();
  });

  it('keeps cached-offline regain listeners after Provider release and removes them with Config release', async () => {
    const onlineEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      onlineEvents.addEventListener.bind(onlineEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      onlineEvents.removeEventListener.bind(onlineEvents),
    );
    const accountRegain = Promise.withResolvers<void>();
    const regainAccountTransport = vi.fn(() => accountRegain.promise);
    const regainServiceTransport = vi.fn(async () => undefined);
    const accountAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 1,
          stagedCommands: [],
          systemWorkerName: 'worker-offline',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const serviceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 1,
          systemWorkerName: 'worker-offline',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () =>
        encodeRight(accountAcquiredApi),
      ),
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight(serviceAcquiredApi),
      ),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_offline',
            accountName: frontend.accountName,
            actorId: 'actr_offline',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'offline-account.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: serviceFrontend.serviceName,
            actorId: 'actr_service_offline',
            actorName: serviceFrontend.actorName,
            frontendName: serviceFrontend.frontendName,
            frontendVersion: serviceFrontend.version,
            databaseName: 'offline-service.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: null,
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_offline_regain_lifetime',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const accountFrontendSpec = makeFrontendControllerSpec(frontend);
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const accountAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_offline',
          generationId: 'gen_offline',
          systemVersion: '1.0.0',
          accountId: 'acct_offline',
          accountName: frontend.accountName,
          actorId: 'actr_offline',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'cached-offline',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: regainAccountTransport,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const accountHydration = await Effect.runPromise(
      accountAcquisition.hydrateSession({
        sessionId: 'sesn_account_offline',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    const serviceFrontendSpec =
      makeServiceFrontendControllerSpec(serviceFrontend);
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const serviceAcquisition = await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_offline',
        generationId: 'gen_offline',
        systemVersion: '1.0.0',
        serviceName: serviceFrontend.serviceName,
        actorId: 'actr_service_offline',
        actorName: serviceFrontend.actorName,
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec: serviceFrontendSpec,
        frontendSpecHash: serviceFrontendSpecHash,
        authority: 'cached-offline',
        role: 'active',
        commissionOwnerId: null,
        network: null,
        transportRegain: regainServiceTransport,
      }),
    );
    const serviceHydration = await Effect.runPromise(
      serviceAcquisition.hydrateSession({
        sessionId: 'sesn_service_offline',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    await Effect.runPromise(accountHydration.release);
    await Effect.runPromise(serviceHydration.release);
    onlineEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(regainAccountTransport).toHaveBeenCalledOnce();
      expect(regainServiceTransport).toHaveBeenCalledOnce();
    });

    await Effect.runPromise(
      controller.invalidateCachedAccountFrontendLocators({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend,
      }),
    );
    const lateAccountAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_offline',
          generationId: 'gen_offline',
          systemVersion: '1.0.0',
          accountId: 'acct_offline',
          accountName: frontend.accountName,
          actorId: 'actr_offline',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.either),
    );
    expect(lateAccountAcquisition._tag).toBe('Left');
    expect(partitionApi.acquireFrontendReplica).toHaveBeenCalledOnce();
    accountRegain.resolve();
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });

    await controller.release();
    onlineEvents.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(regainAccountTransport).toHaveBeenCalledOnce();
    expect(regainServiceTransport).toHaveBeenCalledOnce();
    expect(accountAcquiredApi.release).toHaveBeenCalledOnce();
    expect(serviceAcquiredApi.release).toHaveBeenCalledOnce();
  });

  it('keeps online account and service regain listeners reusable, fans update-required to every session, and removes them with Config release', async () => {
    const onlineEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      onlineEvents.addEventListener.bind(onlineEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      onlineEvents.removeEventListener.bind(onlineEvents),
    );
    let accountRegainCount = 0;
    const regainAccountTransport = vi.fn(
      async (): Promise<'update-required' | void> => {
        accountRegainCount += 1;
        return accountRegainCount === 2 ? 'update-required' : undefined;
      },
    );
    let serviceRegainCount = 0;
    const regainServiceTransport = vi.fn(
      async (): Promise<'update-required' | void> => {
        serviceRegainCount += 1;
        return serviceRegainCount === 2 ? 'update-required' : undefined;
      },
    );
    const accountAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 1,
          stagedCommands: [],
          systemWorkerName: 'worker-online-regain',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const serviceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 1,
          systemWorkerName: 'worker-online-regain',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () =>
        encodeRight(accountAcquiredApi),
      ),
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight(serviceAcquiredApi),
      ),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_online_regain',
            accountName: frontend.accountName,
            actorId: 'actr_online_regain',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'online-regain-account.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: serviceFrontend.serviceName,
            actorId: 'actr_service_online_regain',
            actorName: serviceFrontend.actorName,
            frontendName: serviceFrontend.frontendName,
            frontendVersion: serviceFrontend.version,
            databaseName: 'online-regain-service.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: null,
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_online_regain_lifetime',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const accountFrontendSpec = makeFrontendControllerSpec(frontend);
    const accountFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(accountFrontendSpec),
    );
    const accountAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_online_regain',
          generationId: 'gen_online_regain',
          systemVersion: '1.0.0',
          accountId: 'acct_online_regain',
          accountName: frontend.accountName,
          actorId: 'actr_online_regain',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec: accountFrontendSpec,
          frontendSpecHash: accountFrontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: regainAccountTransport,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const firstAccountUpdateRequired = vi.fn();
    const firstAccountHydration = await Effect.runPromise(
      accountAcquisition.hydrateSession({
        sessionId: 'sesn_account_online_regain_first',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: firstAccountUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondAccountUpdateRequired = vi.fn();
    const secondAccountHydration = await Effect.runPromise(
      accountAcquisition.hydrateSession({
        sessionId: 'sesn_account_online_regain_second',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: secondAccountUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    const serviceFrontendSpec =
      makeServiceFrontendControllerSpec(serviceFrontend);
    const serviceFrontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(serviceFrontendSpec),
    );
    const serviceAcquisition = await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_online_regain',
        generationId: 'gen_online_regain',
        systemVersion: '1.0.0',
        serviceName: serviceFrontend.serviceName,
        actorId: 'actr_service_online_regain',
        actorName: serviceFrontend.actorName,
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec: serviceFrontendSpec,
        frontendSpecHash: serviceFrontendSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        network: null,
        transportRegain: regainServiceTransport,
      }),
    );
    const firstServiceUpdateRequired = vi.fn();
    const firstServiceHydration = await Effect.runPromise(
      serviceAcquisition.hydrateSession({
        sessionId: 'sesn_service_online_regain_first',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: firstServiceUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondServiceUpdateRequired = vi.fn();
    const secondServiceHydration = await Effect.runPromise(
      serviceAcquisition.hydrateSession({
        sessionId: 'sesn_service_online_regain_second',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: secondServiceUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    onlineEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(regainAccountTransport).toHaveBeenCalledOnce();
      expect(regainServiceTransport).toHaveBeenCalledOnce();
    });
    expect(firstAccountUpdateRequired).not.toHaveBeenCalled();
    expect(secondAccountUpdateRequired).not.toHaveBeenCalled();
    expect(firstServiceUpdateRequired).not.toHaveBeenCalled();
    expect(secondServiceUpdateRequired).not.toHaveBeenCalled();

    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
    onlineEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(regainAccountTransport).toHaveBeenCalledTimes(2);
      expect(regainServiceTransport).toHaveBeenCalledTimes(2);
      expect(firstAccountUpdateRequired).toHaveBeenCalledOnce();
      expect(secondAccountUpdateRequired).toHaveBeenCalledOnce();
      expect(firstServiceUpdateRequired).toHaveBeenCalledOnce();
      expect(secondServiceUpdateRequired).toHaveBeenCalledOnce();
    });

    await Effect.runPromise(firstAccountHydration.release);
    await Effect.runPromise(secondAccountHydration.release);
    await Effect.runPromise(firstServiceHydration.release);
    await Effect.runPromise(secondServiceHydration.release);
    await controller.release();
    onlineEvents.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(regainAccountTransport).toHaveBeenCalledTimes(2);
    expect(regainServiceTransport).toHaveBeenCalledTimes(2);
    expect(accountAcquiredApi.release).toHaveBeenCalledOnce();
    expect(serviceAcquiredApi.release).toHaveBeenCalledOnce();
  });

  it('waits for account hydration to stop before authority teardown and releases exactly once', async () => {
    const initialState = Promise.withResolvers<unknown>();
    const replaceFrontendState = vi.fn(async () => undefined);
    const teardown = vi.fn(async () => undefined);
    const acquiredApi = {
      getFrontendState: vi.fn(() => initialState.promise),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_revoked',
            accountName: frontend.accountName,
            actorId: 'actr_revoked',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'revoked.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_account_revocation_barrier',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_revoked',
          generationId: 'gen_revoked',
          systemVersion: '1.0.0',
          accountId: 'acct_revoked',
          accountName: frontend.accountName,
          actorId: 'actr_revoked',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const hydration = Effect.runPromise(
      acquisition
        .hydrateSession({
          sessionId: 'sesn_revoked',
          replaceFrontendState,
          handleFrontendReplicaBlock: async () => undefined,
          setDatabaseName: () => undefined,
          setOnline: () => undefined,
          setRepairing: () => undefined,
          setUpdateRequired: () => undefined,
          setFailure: () => undefined,
          teardown,
        })
        .pipe(Effect.either),
    );
    await vi.waitFor(() =>
      expect(acquiredApi.getFrontendState).toHaveBeenCalledOnce(),
    );

    const invalidation = Effect.runPromise(
      controller.invalidateCachedAccountFrontendLocators({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend,
      }),
    );
    await Promise.resolve();
    expect(teardown).not.toHaveBeenCalled();
    expect(acquiredApi.release).not.toHaveBeenCalled();

    initialState.resolve(
      encodeRight({
        replicaIndex: 3,
        stagedCommands: [],
        systemWorkerName: 'worker-revoked',
      }),
    );
    const hydrationResult = await hydration;
    await invalidation;

    expect(hydrationResult._tag).toBe('Left');
    expect(partitionApi.listAccountFrontendReplicas).toHaveBeenCalledOnce();
    expect(replaceFrontendState).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(acquiredApi.release).toHaveBeenCalledOnce(),
    );
  });

  it('waits for service hydration to stop before authority teardown and releases exactly once', async () => {
    const initialState = Promise.withResolvers<unknown>();
    const replaceFrontendState = vi.fn(async () => undefined);
    const teardown = vi.fn(async () => undefined);
    const acquiredApi = {
      getFrontendState: vi.fn(() => initialState.promise),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight(acquiredApi),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: serviceFrontend.serviceName,
            actorId: 'actr_service_revoked',
            actorName: serviceFrontend.actorName,
            frontendName: serviceFrontend.frontendName,
            frontendVersion: serviceFrontend.version,
            databaseName: 'service-revoked.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: null,
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_service_revocation_barrier',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeServiceFrontendControllerSpec(serviceFrontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_service_revoked',
        generationId: 'gen_service_revoked',
        systemVersion: '1.0.0',
        serviceName: serviceFrontend.serviceName,
        actorId: 'actr_service_revoked',
        actorName: serviceFrontend.actorName,
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec,
        frontendSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        network: null,
        transportRegain: null,
      }),
    );
    const hydration = Effect.runPromise(
      acquisition
        .hydrateSession({
          sessionId: 'sesn_service_revoked',
          replaceFrontendState,
          handleServiceFrontendReplicaBlock: async () => undefined,
          setDatabaseName: () => undefined,
          setOnline: () => undefined,
          setRepairing: () => undefined,
          setUpdateRequired: () => undefined,
          setFailure: () => undefined,
          teardown,
        })
        .pipe(Effect.either),
    );
    await vi.waitFor(() =>
      expect(acquiredApi.getFrontendState).toHaveBeenCalledOnce(),
    );

    const invalidation = Effect.runPromise(
      controller.invalidateCachedServiceFrontendLocators({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: serviceFrontend,
      }),
    );
    await Promise.resolve();
    expect(teardown).not.toHaveBeenCalled();
    expect(acquiredApi.release).not.toHaveBeenCalled();

    initialState.resolve(
      encodeRight({
        replicaIndex: 3,
        systemWorkerName: 'worker-service-revoked',
      }),
    );
    const hydrationResult = await hydration;
    await invalidation;

    expect(hydrationResult._tag).toBe('Left');
    expect(partitionApi.listServiceFrontendReplicas).not.toHaveBeenCalled();
    expect(replaceFrontendState).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(acquiredApi.release).toHaveBeenCalledOnce(),
    );
  });

  it('queues callbacks behind hydration, remounts from a fresh snapshot, and serializes callback repair', async () => {
    const events: string[] = [];
    const initialState = Promise.withResolvers<unknown>();
    const repairState = Promise.withResolvers<unknown>();
    const acquiredApi = {
      getFrontendState: vi
        .fn()
        .mockImplementationOnce(() => initialState.promise)
        .mockResolvedValueOnce(
          encodeRight({
            replicaIndex: 6,
            stagedCommands: [],
            systemWorkerName: 'worker-barrier',
          }),
        )
        .mockResolvedValueOnce(
          encodeRight({
            replicaIndex: 6,
            stagedCommands: [],
            systemWorkerName: 'worker-barrier',
          }),
        )
        .mockImplementationOnce(() => repairState.promise),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_barrier',
            accountName: frontend.accountName,
            actorId: 'actr_barrier',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'barrier.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_barrier',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_barrier',
          generationId: 'gen_barrier',
          systemVersion: '1.0.0',
          accountId: 'acct_barrier',
          accountName: frontend.accountName,
          actorId: 'actr_barrier',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const provider =
      partitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Account provider capability was not registered');
    }

    const firstHydration = Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_first',
        replaceFrontendState: async state => {
          events.push(`first-snapshot:${state.replicaIndex}`);
        },
        handleFrontendReplicaBlock: async block => {
          events.push(`first-block:${block.replicaIndex}`);
        },
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    await vi.waitFor(() =>
      expect(acquiredApi.getFrontendState).toHaveBeenCalledOnce(),
    );
    await provider.handleFrontendReplicaBlock({ replicaIndex: 6 });
    expect(events).toEqual([]);

    initialState.resolve(
      encodeRight({
        replicaIndex: 5,
        stagedCommands: [],
        systemWorkerName: 'worker-barrier',
      }),
    );
    const firstHydrated = await firstHydration;
    expect(events).toEqual(['first-snapshot:5', 'first-block:6']);
    await Effect.runPromise(firstHydrated.release);

    const remountedAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_barrier',
          generationId: 'gen_barrier',
          systemVersion: '1.0.0',
          accountId: 'acct_barrier',
          accountName: frontend.accountName,
          actorId: 'actr_barrier',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    let failsNextBlock = true;
    const remountedHydration = await Effect.runPromise(
      remountedAcquisition.hydrateSession({
        sessionId: 'sesn_second',
        replaceFrontendState: async state => {
          events.push(`second-snapshot:${state.replicaIndex}`);
        },
        handleFrontendReplicaBlock: async block => {
          if (failsNextBlock) {
            failsNextBlock = false;
            events.push(`second-block-failed:${block.replicaIndex}`);
            throw new Error('injected callback failure');
          }
          events.push(`second-block:${block.replicaIndex}`);
        },
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => {
          events.push('second-repairing');
        },
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    expect(partitionApi.acquireFrontendReplica).toHaveBeenCalledOnce();
    expect(events.at(-1)).toBe('second-snapshot:6');

    const healthyBlockIndices: number[] = [];
    const healthyHydration = await Effect.runPromise(
      remountedAcquisition.hydrateSession({
        sessionId: 'sesn_healthy_sibling',
        replaceFrontendState: async state => {
          events.push(`healthy-snapshot:${state.replicaIndex}`);
        },
        handleFrontendReplicaBlock: async block => {
          healthyBlockIndices.push(block.replicaIndex);
          events.push(`healthy-block:${block.replicaIndex}`);
        },
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => {
          throw new Error('Healthy sibling must not enter repair');
        },
        setUpdateRequired: () => undefined,
        setFailure: () => {
          throw new Error('Healthy sibling must not fail');
        },
        teardown: async () => undefined,
      }),
    );
    expect(events.at(-1)).toBe('healthy-snapshot:6');

    await provider.handleFrontendReplicaBlock({ replicaIndex: 7 });
    await vi.waitFor(() =>
      expect(acquiredApi.getFrontendState).toHaveBeenCalledTimes(4),
    );
    expect(healthyBlockIndices).toEqual([7]);
    await provider.handleFrontendReplicaBlock({ replicaIndex: 8 });
    expect(healthyBlockIndices).toEqual([7, 8]);
    repairState.resolve(
      encodeRight({
        replicaIndex: 7,
        stagedCommands: [],
        systemWorkerName: 'worker-barrier',
      }),
    );
    await vi.waitFor(() => expect(events.at(-1)).toBe('second-block:8'));
    expect(events.slice(-8)).toEqual([
      'second-snapshot:6',
      'healthy-snapshot:6',
      'second-block-failed:7',
      'second-repairing',
      'healthy-block:7',
      'healthy-block:8',
      'second-snapshot:7',
      'second-block:8',
    ]);
    expect(events.filter(event => event === 'healthy-block:7')).toHaveLength(1);
    expect(events.filter(event => event === 'healthy-block:8')).toHaveLength(1);
    expect(events.filter(event => event === 'second-block:8')).toHaveLength(1);

    await Effect.runPromise(remountedHydration.release);
    await Effect.runPromise(healthyHydration.release);
  });

  it('tears down only the account session whose callback repair cannot converge', async () => {
    const failedSessionBlocks: number[] = [];
    const healthySessionBlocks: number[] = [];
    const failedSessionFailure = vi.fn();
    const failedSessionTeardown = vi.fn(async () => undefined);
    const acquiredApi = {
      getFrontendState: vi
        .fn()
        .mockResolvedValueOnce(
          encodeRight({
            replicaIndex: 1,
            stagedCommands: [],
            systemWorkerName: 'worker-repair-isolation',
          }),
        )
        .mockResolvedValueOnce(
          encodeRight({
            replicaIndex: 1,
            stagedCommands: [],
            systemWorkerName: 'worker-repair-isolation',
          }),
        )
        .mockResolvedValueOnce(
          encodeRight({
            replicaIndex: 2,
            stagedCommands: [],
            systemWorkerName: 'worker-repair-isolation',
          }),
        ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_repair_isolation',
            accountName: frontend.accountName,
            actorId: 'actr_repair_isolation',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'repair-isolation.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_repair_isolation',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_repair_isolation',
          generationId: 'gen_repair_isolation',
          systemVersion: '1.0.0',
          accountId: 'acct_repair_isolation',
          accountName: frontend.accountName,
          actorId: 'actr_repair_isolation',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const provider =
      partitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Account provider capability was not registered');
    }

    const failedSession = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_repair_fails',
        replaceFrontendState: async state => {
          if (state.replicaIndex === 2) {
            throw new Error('injected snapshot replacement failure');
          }
        },
        handleFrontendReplicaBlock: async block => {
          failedSessionBlocks.push(block.replicaIndex);
          throw new Error('injected block callback failure');
        },
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: failedSessionFailure,
        teardown: failedSessionTeardown,
      }),
    );
    const healthySession = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_repair_healthy',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async block => {
          healthySessionBlocks.push(block.replicaIndex);
        },
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => {
          throw new Error('Healthy sibling must not enter repair');
        },
        setUpdateRequired: () => undefined,
        setFailure: () => {
          throw new Error('Healthy sibling must not fail');
        },
        teardown: async () => undefined,
      }),
    );

    await provider.handleFrontendReplicaBlock({ replicaIndex: 2 });
    await vi.waitFor(() => expect(failedSessionTeardown).toHaveBeenCalledOnce());
    await provider.handleFrontendReplicaBlock({ replicaIndex: 3 });

    expect(failedSessionBlocks).toEqual([2]);
    expect(failedSessionFailure).toHaveBeenCalledOnce();
    expect(failedSessionTeardown).toHaveBeenCalledOnce();
    expect(healthySessionBlocks).toEqual([2, 3]);

    await Effect.runPromise(failedSession.release);
    await Effect.runPromise(healthySession.release);
  });

  it('broadcasts same-generation account frontend-version authority to current and later sessions', async () => {
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          stagedCommands: [],
          systemWorkerName: 'worker-version-authority',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_version_authority',
            accountName: frontend.accountName,
            actorId: 'actr_version_authority',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'version-authority-account.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );
    const ticket = vi
      .fn()
      .mockResolvedValueOnce(
        encodeRight({
          ticket: 'same-version-ticket',
          systemId: 'sys_version_authority',
          generationId: 'gen_version_authority',
          accountId: 'acct_version_authority',
          accountName: frontend.accountName,
          actorId: 'actr_version_authority',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
        }),
      )
      .mockResolvedValueOnce(
        encodeRight({
          ticket: 'successor-generation-ticket',
          systemId: 'sys_version_authority',
          generationId: 'gen_version_successor',
          accountId: 'acct_version_authority',
          accountName: frontend.accountName,
          actorId: 'actr_version_authority',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: '2.0.0',
        }),
      )
      .mockResolvedValueOnce(
        encodeRight({
          ticket: 'same-generation-new-version-ticket',
          systemId: 'sys_version_authority',
          generationId: 'gen_version_authority',
          accountId: 'acct_version_authority',
          accountName: frontend.accountName,
          actorId: 'actr_version_authority',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: '2.0.0',
        }),
      );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_account_version_authority',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_version_authority',
          generationId: 'gen_version_authority',
          systemVersion: '1.0.0',
          accountId: 'acct_version_authority',
          accountName: frontend.accountName,
          actorId: 'actr_version_authority',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: {
            getFrontendState: vi.fn(async () =>
              encodeRight({
                accountId: 'acct_version_authority',
                accountName: frontend.accountName,
                actorId: 'actr_version_authority',
                actorName: frontend.actorName,
                systemId: 'sys_version_authority',
                generationId: 'gen_version_authority',
                systemVersion: '1.0.0',
                systemWorkerName: 'worker-version-authority',
                frontendName: frontend.frontendName,
                frontendIndex: 0,
                lastRebasedPushedCursor: null,
                pushedCommands: [],
                resources: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
              }),
            ),
            createFrontendWebSocketTicket: ticket,
            pushCommands: vi.fn(async () =>
              encodeRight({
                pendingCommands: [],
                pushedCommands: [],
                failedCommands: [],
              }),
            ),
            releaseFrontendApi: vi.fn(),
          },
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const provider =
      partitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Account version-authority provider missing');
    }
    const firstUpdateRequired = vi.fn();
    const secondUpdateRequired = vi.fn();
    const laterUpdateRequired = vi.fn();
    const firstHydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_account_version_first',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: firstUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondHydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_account_version_second',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: secondUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    await provider.createFrontendWebSocketTicket();
    expect(firstUpdateRequired).not.toHaveBeenCalled();
    expect(secondUpdateRequired).not.toHaveBeenCalled();
    await provider.createFrontendWebSocketTicket();
    expect(firstUpdateRequired).not.toHaveBeenCalled();
    expect(secondUpdateRequired).not.toHaveBeenCalled();
    await provider.createFrontendWebSocketTicket();
    expect(firstUpdateRequired).toHaveBeenCalledOnce();
    expect(secondUpdateRequired).toHaveBeenCalledOnce();

    const laterHydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_account_version_later',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: laterUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    expect(laterUpdateRequired).toHaveBeenCalledOnce();

    await Effect.runPromise(firstHydration.release);
    await Effect.runPromise(secondHydration.release);
    await Effect.runPromise(laterHydration.release);
    await controller.release();
  });

  it('broadcasts same-generation service frontend-version authority to current and later sessions', async () => {
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          systemWorkerName: 'worker-service-version-authority',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight(acquiredApi),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: serviceFrontend.serviceName,
            actorId: 'actr_service_version_authority',
            actorName: serviceFrontend.actorName,
            frontendName: serviceFrontend.frontendName,
            frontendVersion: serviceFrontend.version,
            databaseName: 'version-authority-service.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: null,
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.void,
      }),
    );
    const ticket = vi
      .fn()
      .mockResolvedValueOnce(
        encodeRight({
          ticket: 'same-service-version-ticket',
          systemId: 'sys_service_version_authority',
          generationId: 'gen_service_version_authority',
          serviceName: serviceFrontend.serviceName,
          actorId: 'actr_service_version_authority',
          actorName: serviceFrontend.actorName,
          frontendName: serviceFrontend.frontendName,
          frontendVersion: serviceFrontend.version,
        }),
      )
      .mockResolvedValueOnce(
        encodeRight({
          ticket: 'successor-service-generation-ticket',
          systemId: 'sys_service_version_authority',
          generationId: 'gen_service_version_successor',
          serviceName: serviceFrontend.serviceName,
          actorId: 'actr_service_version_authority',
          actorName: serviceFrontend.actorName,
          frontendName: serviceFrontend.frontendName,
          frontendVersion: '2.0.0',
        }),
      )
      .mockResolvedValueOnce(
        encodeRight({
          ticket: 'same-generation-new-service-version-ticket',
          systemId: 'sys_service_version_authority',
          generationId: 'gen_service_version_authority',
          serviceName: serviceFrontend.serviceName,
          actorId: 'actr_service_version_authority',
          actorName: serviceFrontend.actorName,
          frontendName: serviceFrontend.frontendName,
          frontendVersion: '2.0.0',
        }),
      );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_service_version_authority',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeServiceFrontendControllerSpec(serviceFrontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: serviceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_service_version_authority',
        generationId: 'gen_service_version_authority',
        systemVersion: '1.0.0',
        serviceName: serviceFrontend.serviceName,
        actorId: 'actr_service_version_authority',
        actorName: serviceFrontend.actorName,
        frontendName: serviceFrontend.frontendName,
        frontendVersion: serviceFrontend.version,
        frontendSpec,
        frontendSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        network: {
          getFrontendState: vi.fn(async () =>
            encodeRight({
              actorId: 'actr_service_version_authority',
              actorName: serviceFrontend.actorName,
              systemId: 'sys_service_version_authority',
              generationId: 'gen_service_version_authority',
              systemVersion: '1.0.0',
              systemWorkerName: 'worker-service-version-authority',
              serviceName: serviceFrontend.serviceName,
              frontendName: serviceFrontend.frontendName,
              frontendIndex: 0,
              resources: [],
            }),
          ),
          createFrontendWebSocketTicket: ticket,
          releaseFrontendApi: vi.fn(),
        },
        transportRegain: null,
      }),
    );
    const provider =
      partitionApi.acquireServiceFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Service version-authority provider missing');
    }
    const firstUpdateRequired = vi.fn();
    const secondUpdateRequired = vi.fn();
    const laterUpdateRequired = vi.fn();
    const firstHydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_service_version_first',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: firstUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondHydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_service_version_second',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: secondUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    await provider.createFrontendWebSocketTicket();
    expect(firstUpdateRequired).not.toHaveBeenCalled();
    expect(secondUpdateRequired).not.toHaveBeenCalled();
    await provider.createFrontendWebSocketTicket();
    expect(firstUpdateRequired).not.toHaveBeenCalled();
    expect(secondUpdateRequired).not.toHaveBeenCalled();
    await provider.createFrontendWebSocketTicket();
    expect(firstUpdateRequired).toHaveBeenCalledOnce();
    expect(secondUpdateRequired).toHaveBeenCalledOnce();

    const laterHydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_service_version_later',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: laterUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    expect(laterUpdateRequired).toHaveBeenCalledOnce();

    await Effect.runPromise(firstHydration.release);
    await Effect.runPromise(secondHydration.release);
    await Effect.runPromise(laterHydration.release);
    await controller.release();
  });

  it('releases Config without waiting for a transport-regain promise that never settles', async () => {
    const onlineEvents = new EventTarget();
    vi.stubGlobal(
      'addEventListener',
      onlineEvents.addEventListener.bind(onlineEvents),
    );
    vi.stubGlobal(
      'removeEventListener',
      onlineEvents.removeEventListener.bind(onlineEvents),
    );
    const neverSettledRegain = Promise.withResolvers<void>();
    const regainAccountTransport = vi.fn(() => neverSettledRegain.promise);
    const releaseSharedWorkerRoot = vi.fn();
    const acquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 1,
          stagedCommands: [],
          systemWorkerName: 'worker-never-settled-regain',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_never_settled_regain',
            accountName: frontend.accountName,
            actorId: 'actr_never_settled_regain',
            actorName: frontend.actorName,
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            databaseName: 'never-settled-regain.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.sync(releaseSharedWorkerRoot),
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_never_settled_regain',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_never_settled_regain',
          generationId: 'gen_never_settled_regain',
          systemVersion: '1.0.0',
          accountId: 'acct_never_settled_regain',
          accountName: frontend.accountName,
          actorId: 'actr_never_settled_regain',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'cached-offline',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: regainAccountTransport,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const hydration = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_never_settled_regain',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    onlineEvents.dispatchEvent(new Event('online'));
    await vi.waitFor(() =>
      expect(regainAccountTransport).toHaveBeenCalledOnce(),
    );

    await controller.release();

    expect(acquiredApi.release).toHaveBeenCalledOnce();
    expect(releaseSharedWorkerRoot).toHaveBeenCalledOnce();
    onlineEvents.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(regainAccountTransport).toHaveBeenCalledOnce();
    await Effect.runPromise(hydration.release);
  });

  it('closes the worker root before awaiting a hydration RPC stranded on that root', async () => {
    const pendingState = Promise.withResolvers<unknown>();
    const pendingAcquisitionRelease = Promise.withResolvers<unknown>();
    const releaseSharedWorkerRoot = vi.fn(() => {
      pendingState.reject(new Error('injected dead worker state RPC'));
      pendingAcquisitionRelease.reject(
        new Error('injected dead worker release RPC'),
      );
    });
    const teardown = vi.fn(async () => undefined);
    const acquiredApi = {
      getFrontendState: vi.fn(() => pendingState.promise),
      release: vi.fn(() => pendingAcquisitionRelease.promise),
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(acquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.sync(releaseSharedWorkerRoot),
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_dead_hydration_root',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_dead_hydration_root',
          generationId: 'gen_dead_hydration_root',
          systemVersion: '1.0.0',
          accountId: 'acct_dead_hydration_root',
          accountName: frontend.accountName,
          actorId: 'actr_dead_hydration_root',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const hydration = Effect.runPromise(
      acquisition
        .hydrateSession({
          sessionId: 'sesn_dead_hydration_root',
          replaceFrontendState: async () => undefined,
          handleFrontendReplicaBlock: async () => undefined,
          setDatabaseName: () => undefined,
          setOnline: () => undefined,
          setRepairing: () => undefined,
          setUpdateRequired: () => undefined,
          setFailure: () => undefined,
          teardown,
        })
        .pipe(Effect.either),
    );
    await vi.waitFor(() =>
      expect(acquiredApi.getFrontendState).toHaveBeenCalledOnce(),
    );

    await controller.release();
    const hydrationResult = await hydration;

    expect(hydrationResult._tag).toBe('Left');
    expect(acquiredApi.release).toHaveBeenCalledOnce();
    expect(releaseSharedWorkerRoot).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('releases a worker session whose partition-root RPC never settles', async () => {
    const pendingPartitionApi = Promise.withResolvers<unknown>();
    const releaseSharedWorkerRoot = vi.fn(() => {
      pendingPartitionApi.reject(new Error('injected dead partition-root RPC'));
    });
    const getPartitionApi = vi.fn(() => pendingPartitionApi.promise);
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: { getPartitionApi },
        release: Effect.sync(releaseSharedWorkerRoot),
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_dead_partition_root',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_dead_partition_root',
          generationId: 'gen_dead_partition_root',
          systemVersion: '1.0.0',
          accountId: 'acct_dead_partition_root',
          accountName: frontend.accountName,
          actorId: 'actr_dead_partition_root',
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          network: null,
          transportRegain: null,
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.either),
    );
    await vi.waitFor(() => expect(getPartitionApi).toHaveBeenCalledOnce());

    await controller.release();
    const acquisitionResult = await acquisition;

    expect(acquisitionResult._tag).toBe('Left');
    expect(releaseSharedWorkerRoot).toHaveBeenCalledOnce();
  });
});
