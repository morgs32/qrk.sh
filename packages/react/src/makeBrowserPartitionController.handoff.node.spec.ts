import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import { primitives } from '@zerospin/core/models/primitives';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { ZerospinError } from '@zerospin/error';
import { Effect, Either, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeBrowserPartitionController } from './makeBrowserPartitionController';

const makeSharedWorkerSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/shared-worker/makeSharedWorkerSession', () => ({
  makeSharedWorkerSession: makeSharedWorkerSessionMock,
}));

const renameItem = makeContract(
  {
    commandName: 'renameItem',
    version: '3.0.0',
    payload: {
      title: primitives.text(),
    },
    mutations: null,
  },
  [
    {
      commandName: 'renameItem',
      version: '1.0.0',
      payload: {
        name: primitives.text(),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ title: `v1:${payload.name}` }),
    },
    {
      commandName: 'renameItem',
      version: '2.0.0',
      payload: {
        label: primitives.text(),
      },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ title: `v2:${payload.label}` }),
    },
  ],
);

const sourceFrontendV1 = makeFrontendController({
  systemName: 'handoff-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const sourceFrontendV2 = makeFrontendController({
  systemName: 'handoff-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '2.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const targetFrontend = makeFrontendController({
  systemName: 'handoff-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '3.0.0',
  models: {},
  contracts: { renameItem },
  signature: Schema.Struct({ userId: Schema.String }),
});

const sourceServiceFrontend = makeServiceFrontendController({
  systemName: 'handoff-system',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog-web',
  version: '1.0.0',
  models: {},
  signature: Schema.Struct({ viewerId: Schema.String }),
});

const targetServiceFrontend = makeServiceFrontendController({
  systemName: 'handoff-system',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog-web',
  version: '2.0.0',
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

describe('makeBrowserPartitionController dormant command activation', () => {
  it('revokes every matching locator, acquisition, and main-thread session after provider signature rejection', async () => {
    const acquiredRelease = vi.fn(async () => encodeRight(undefined));
    const releaseFrontendApi = vi.fn();
    const teardown = vi.fn(async () => undefined);
    const providerSignatureFailure = new ZerospinError({
      code: 'frontend-provider-state-signature-invalid',
      message: 'The current Config signature did not match the local schema',
    });
    const partitionApi = {
      acquireFrontendReplica: vi.fn(async () =>
        encodeRight({
          getFrontendState: vi.fn(async () =>
            encodeRight({
              replicaIndex: 0,
              stagedCommands: [],
              systemWorkerName: 'worker-authority',
            }),
          ),
          release: acquiredRelease,
        }),
      ),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_authority',
            accountName: sourceFrontendV1.accountName,
            actorId: 'actr_authority',
            actorName: sourceFrontendV1.actorName,
            frontendName: sourceFrontendV1.frontendName,
            frontendVersion: sourceFrontendV1.version,
            databaseName: 'authority.sqlite3',
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
      partitionKey: 'partition_authority_revocation',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_authority',
          generationId: 'gen_authority',
          systemVersion: '1.0.0',
          accountId: 'acct_authority',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_authority',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: {
            releaseFrontendApi,
            getFrontendState: vi.fn(async () =>
              encodeLeft(providerSignatureFailure),
            ),
            createFrontendWebSocketTicket: vi.fn(async () => encodeRight({})),
            pushCommands: vi.fn(async () => encodeRight({})),
          },
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_authority',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_authority',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_authority',
        generationId: 'gen_authority',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-authority',
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV2,
      role: 'commissioned',
      identity: {
        systemName: sourceFrontendV2.systemName,
        accountName: sourceFrontendV2.accountName,
        accountId: 'acct_authority',
        actorName: sourceFrontendV2.actorName,
        actorId: 'actr_authority',
        frontendName: sourceFrontendV2.frontendName,
        frontendVersion: sourceFrontendV2.version,
        systemId: 'sys_authority_successor',
        generationId: 'gen_authority_successor',
        systemVersion: '2.0.0',
        systemWorkerName: 'worker-authority-successor',
      },
    });
    const hydrated = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_authority',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown,
      }),
    );
    const provider =
      partitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Account provider capability was not registered');
    }

    const encodedSignatureFailure = await provider.getFrontendState();

    expect(encodedSignatureFailure).toEqual(encodeLeft(providerSignatureFailure));
    expect(releaseFrontendApi).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledOnce();
    expect(acquiredRelease).not.toHaveBeenCalled();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      }),
    ).toBeNull();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV2,
        role: 'commissioned',
      }),
    ).toBeNull();
    await vi.waitFor(() => expect(acquiredRelease).toHaveBeenCalledOnce());
    await Effect.runPromise(hydrated.release);
  });

  it('returns service provider authentication rejection before releasing the worker acquisition', async () => {
    const acquiredRelease = vi.fn(async () => encodeRight(undefined));
    const releaseFrontendApi = vi.fn();
    const teardown = vi.fn(async () => undefined);
    const providerAuthenticationFailure = new ZerospinError({
      code: 'service-frontend-authentication-failed',
      message: 'Authority rejected the current service Config credential',
    });
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight({
          getFrontendState: vi.fn(async () =>
            encodeRight({
              replicaIndex: 0,
              systemWorkerName: 'worker-service-authority',
            }),
          ),
          release: acquiredRelease,
        }),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: sourceServiceFrontend.serviceName,
            actorId: 'actr_service_authority',
            actorName: sourceServiceFrontend.actorName,
            frontendName: sourceServiceFrontend.frontendName,
            frontendVersion: sourceServiceFrontend.version,
            databaseName: 'service-authority.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
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
      partitionKey: 'partition_service_authority_revocation',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeServiceFrontendControllerSpec(
      sourceServiceFrontend,
    );
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireServiceFrontendReplica({
          frontend: sourceServiceFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_service_authority',
          generationId: 'gen_service_authority',
          systemVersion: '1.0.0',
          serviceName: sourceServiceFrontend.serviceName,
          actorId: 'actr_service_authority',
          actorName: sourceServiceFrontend.actorName,
          frontendName: sourceServiceFrontend.frontendName,
          frontendVersion: sourceServiceFrontend.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: {
            releaseFrontendApi,
            getFrontendState: vi.fn(async () =>
              encodeLeft(providerAuthenticationFailure),
            ),
            createFrontendWebSocketTicket: vi.fn(async () => encodeRight({})),
          },
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceServiceFrontend,
      role: 'active',
      identity: {
        systemName: sourceServiceFrontend.systemName,
        serviceName: sourceServiceFrontend.serviceName,
        actorName: sourceServiceFrontend.actorName,
        actorId: 'actr_service_authority',
        frontendName: sourceServiceFrontend.frontendName,
        frontendVersion: sourceServiceFrontend.version,
        systemId: 'sys_service_authority',
        generationId: 'gen_service_authority',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-service-authority',
      },
    });
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: targetServiceFrontend,
      role: 'commissioned',
      identity: {
        systemName: targetServiceFrontend.systemName,
        serviceName: targetServiceFrontend.serviceName,
        actorName: targetServiceFrontend.actorName,
        actorId: 'actr_service_authority',
        frontendName: targetServiceFrontend.frontendName,
        frontendVersion: targetServiceFrontend.version,
        systemId: 'sys_service_authority_successor',
        generationId: 'gen_service_authority_successor',
        systemVersion: '2.0.0',
        systemWorkerName: 'worker-service-authority-successor',
      },
    });
    const hydrated = await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_service_authority',
        replaceFrontendState: async () => undefined,
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown,
      }),
    );
    const provider =
      partitionApi.acquireServiceFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Service provider capability was not registered');
    }

    const encodedAuthenticationFailure = await provider.getFrontendState();

    expect(encodedAuthenticationFailure).toEqual(
      encodeLeft(providerAuthenticationFailure),
    );
    expect(releaseFrontendApi).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledOnce();
    expect(acquiredRelease).not.toHaveBeenCalled();
    expect(
      controller.getCachedServiceFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceServiceFrontend,
        role: 'active',
      }),
    ).toBeNull();
    expect(
      controller.getCachedServiceFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: targetServiceFrontend,
        role: 'commissioned',
      }),
    ).toBeNull();
    await vi.waitFor(() => expect(acquiredRelease).toHaveBeenCalledOnce());
    await Effect.runPromise(hydrated.release);
  });

  it('detaches conflicting authenticated identities across versions without touching another origin', async () => {
    const sourceRelease = vi.fn(async () => encodeRight(undefined));
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({ replicaIndex: 0, stagedCommands: [] }),
      ),
      release: sourceRelease,
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          stagedCommands: [],
          systemWorkerName: 'worker-target',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(sourceAcquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_old_identity'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_identity_change',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const sourceSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const sourceSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_old_identity',
          generationId: 'gen_old_identity',
          systemVersion: '1.0.0',
          accountId: 'acct_old_identity',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_old_identity',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec: sourceSpec,
          frontendSpecHash: sourceSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_old_identity',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_old_identity',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_old_identity',
        generationId: 'gen_old_identity',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker_old_identity',
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV2,
      role: 'commissioned',
      identity: {
        systemName: sourceFrontendV2.systemName,
        accountName: sourceFrontendV2.accountName,
        accountId: 'acct_old_identity',
        actorName: sourceFrontendV2.actorName,
        actorId: 'actr_old_identity',
        frontendName: sourceFrontendV2.frontendName,
        frontendVersion: sourceFrontendV2.version,
        systemId: 'sys_old_identity',
        generationId: 'gen_old_identity',
        systemVersion: '2.0.0',
        systemWorkerName: 'worker_old_identity',
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://unrelated.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_old_identity',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_old_identity',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_old_identity',
        generationId: 'gen_old_identity',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker_old_identity',
      },
    });

    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_new_identity',
          generationId: 'gen_new_identity',
          systemVersion: '3.0.0',
          accountId: 'acct_new_identity',
          accountName: targetFrontend.accountName,
          actorId: 'actr_new_identity',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    expect(sourceRelease).toHaveBeenCalledTimes(1);
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      }),
    ).toBeNull();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV2,
        role: 'commissioned',
      }),
    ).toBeNull();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://unrelated.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      }),
    ).not.toBeNull();
  });

  it('reads recorded predecessor journals from the commissioned target catalog after the source locator expires', async () => {
    const calls: string[] = [];
    const acquiredRoles: string[] = [];
    const importedCommands: Array<{
      sourceVersion: string;
      stagedCursor: string;
      adaptedVersion: string;
      adaptedSystemVersion: string;
      adaptedPayload: string;
    }> = [];
    const migratedCommands: Array<{
      sourceGenerationId: string;
      commandIds: readonly string[];
    }> = [];
    let replicaIndex = 7;
    const stagedCommands: unknown[] = [];
    let didRecordSourceA = false;
    let didRecordSourceB = false;

    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex,
          stagedCommands,
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async props => {
        acquiredRoles.push(props.role);
        calls.push(`acquire:${props.role}`);
        return encodeRight(targetAcquiredApi);
      }),
      importAdaptedFrontendCommands: vi.fn(async props => {
        const imported = props.commands[0];
        if (imported === undefined) {
          if (props.sourceTarget.generationId === 'gen_source_a') {
            didRecordSourceA = true;
          }
          if (props.sourceTarget.generationId === 'gen_source_b') {
            didRecordSourceB = true;
          }
          calls.push(`record:${props.sourceTarget.generationId}`);
          return encodeRight({ commandIds: [], replicaIndex });
        }
        calls.push(`import:${imported.sourceCommand.version}`);
        importedCommands.push({
          sourceVersion: imported.sourceCommand.version,
          stagedCursor: imported.sourceCommand.stagedCursor,
          adaptedVersion: imported.adaptedCommand.version,
          adaptedSystemVersion: imported.adaptedCommand.systemVersion,
          adaptedPayload: imported.adaptedCommand.payload,
        });
        replicaIndex += 1;
        stagedCommands.push(imported.adaptedCommand);
        return encodeRight({
          commandIds: [imported.adaptedCommand.id],
          replicaIndex,
        });
      }),
      listAccountFrontendReplicas: vi
        .fn()
        .mockResolvedValueOnce(encodeRight([]))
        .mockImplementation(async () =>
          encodeRight([
            {
              accountId: 'acct_handoff',
              accountName: targetFrontend.accountName,
              actorId: 'actr_handoff',
              actorName: targetFrontend.actorName,
              frontendName: targetFrontend.frontendName,
              frontendVersion: targetFrontend.version,
              databaseName: 'afrp_target/replica.db',
              status: 'ready',
              role: 'commissioned',
              frontendIndex: 7,
              replicaIndex: 7,
              activeProviderCount: 1,
              socketState: 'online',
              reconnectAttempt: 0,
              journalHealth: 'healthy',
              hasPendingTransition: false,
              sourceTargets:
                didRecordSourceA && didRecordSourceB
                  ? [
                      {
                        generationId: 'gen_source_a',
                        accountId: 'acct_handoff',
                        accountName: sourceFrontendV1.accountName,
                        actorId: 'actr_handoff',
                        actorName: sourceFrontendV1.actorName,
                        frontendName: sourceFrontendV1.frontendName,
                        frontendVersion: sourceFrontendV1.version,
                      },
                      {
                        generationId: 'gen_source_b',
                        accountId: 'acct_handoff',
                        accountName: sourceFrontendV2.accountName,
                        actorId: 'actr_handoff',
                        actorName: sourceFrontendV2.actorName,
                        frontendName: sourceFrontendV2.frontendName,
                        frontendVersion: sourceFrontendV2.version,
                      },
                    ]
                  : [],
              lastFailure: null,
            },
          ]),
        ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const sourceAPartitionApi = {
      markFrontendCommandsMigrated: vi.fn(async props => {
        if (props.commandIds.length === 0) {
          calls.push('preflight:gen_source_a');
        } else {
          calls.push('mark:1.0.0');
          migratedCommands.push({
            sourceGenerationId: 'gen_source_a',
            commandIds: props.commandIds,
          });
        }
        return encodeRight(undefined);
      }),
      getDormantFrontendCommands: vi.fn(async () => {
        calls.push('read:gen_source_a');
        return encodeRight([
          {
            command: {
              id: 'cmd_source_a',
              commandName: 'renameItem',
              payload: '{"name":"alpha"}',
              systemName: 'handoff-system',
              systemVersion: '1.0.0',
              version: '1.0.0',
              commandType: 'frontend',
              accountId: 'acct_handoff',
              accountName: 'user',
              frontendName: 'web',
              actorId: 'actr_handoff',
              actorName: 'shopper',
              sessionId: 'sesn_source_a',
              stagedCursor: 'stcur_2',
              stagedAt: new Date('2026-01-02T00:00:00.000Z'),
              pushedCursor: null,
              status: 'staged',
            },
            mutations: [],
          },
        ]);
      }),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const sourceBPartitionApi = {
      markFrontendCommandsMigrated: vi.fn(async props => {
        if (props.commandIds.length === 0) {
          calls.push('preflight:gen_source_b');
        } else {
          calls.push('mark:2.0.0');
          migratedCommands.push({
            sourceGenerationId: 'gen_source_b',
            commandIds: props.commandIds,
          });
        }
        return encodeRight(undefined);
      }),
      getDormantFrontendCommands: vi.fn(async () => {
        calls.push('read:gen_source_b');
        return encodeRight([
          {
            command: {
              id: 'cmd_source_b',
              commandName: 'renameItem',
              payload: '{"label":"beta"}',
              systemName: 'handoff-system',
              systemVersion: '2.0.0',
              version: '2.0.0',
              commandType: 'frontend',
              accountId: 'acct_handoff',
              accountName: 'user',
              frontendName: 'web',
              actorId: 'actr_handoff',
              actorName: 'shopper',
              sessionId: 'sesn_source_b',
              stagedCursor: 'stcur_1',
              stagedAt: new Date('2026-01-01T00:00:00.000Z'),
              pushedCursor: null,
              status: 'staged',
            },
            mutations: [],
          },
        ]);
      }),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };

    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => {
            if (props.generationId === 'gen_source_a') {
              return sourceAPartitionApi;
            }
            if (props.generationId === 'gen_source_b') {
              return sourceBPartitionApi;
            }
            return targetPartitionApi;
          }),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_handoff',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_handoff',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_handoff',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_handoff',
        generationId: 'gen_source_a',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-source-a',
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV2,
      role: 'active',
      identity: {
        systemName: sourceFrontendV2.systemName,
        accountName: sourceFrontendV2.accountName,
        accountId: 'acct_handoff',
        actorName: sourceFrontendV2.actorName,
        actorId: 'actr_handoff',
        frontendName: sourceFrontendV2.frontendName,
        frontendVersion: sourceFrontendV2.version,
        systemId: 'sys_handoff',
        generationId: 'gen_source_b',
        systemVersion: '2.0.0',
        systemWorkerName: 'worker-source-b',
      },
    });
    now.mockReturnValue(86_401_001);

    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );

    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_handoff',
          generationId: 'gen_target',
          systemVersion: '3.0.0',
          accountId: 'acct_handoff',
          accountName: targetFrontend.accountName,
          actorId: 'actr_handoff',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'commissioned',
          commissionOwnerId: 'commission_handoff',
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    expect(
      targetPartitionApi.acquireFrontendReplica.mock.calls[0]?.[0],
    ).not.toHaveProperty('sourceTargets');
    expect(calls).toEqual([
      'acquire:commissioned',
      'record:gen_source_a',
      'record:gen_source_b',
    ]);
    expect(didRecordSourceA).toBe(true);
    expect(didRecordSourceB).toBe(true);
    expect(
      sourceAPartitionApi.markFrontendCommandsMigrated,
    ).not.toHaveBeenCalled();
    expect(
      sourceAPartitionApi.getDormantFrontendCommands,
    ).not.toHaveBeenCalled();
    expect(
      sourceBPartitionApi.markFrontendCommandsMigrated,
    ).not.toHaveBeenCalled();
    expect(
      sourceBPartitionApi.getDormantFrontendCommands,
    ).not.toHaveBeenCalled();
    expect(
      targetPartitionApi.importAdaptedFrontendCommands,
    ).toHaveBeenCalledTimes(2);
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      }),
    ).toBeNull();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV2,
        role: 'active',
      }),
    ).toBeNull();

    const result = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_handoff',
          generationId: 'gen_target',
          systemVersion: '3.0.0',
          accountId: 'acct_handoff',
          accountName: targetFrontend.accountName,
          actorId: 'actr_handoff',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.either),
    );

    expect(Either.isRight(result)).toBe(true);
    expect(
      targetPartitionApi.acquireFrontendReplica.mock.calls[1]?.[0],
    ).not.toHaveProperty('sourceTargets');
    expect(acquiredRoles).toEqual(['commissioned', 'active']);
    expect(calls).toEqual([
      'acquire:commissioned',
      'record:gen_source_a',
      'record:gen_source_b',
      'preflight:gen_source_a',
      'read:gen_source_a',
      'record:gen_source_a',
      'preflight:gen_source_b',
      'read:gen_source_b',
      'record:gen_source_b',
      'import:2.0.0',
      'mark:2.0.0',
      'import:1.0.0',
      'mark:1.0.0',
      'acquire:active',
    ]);
    expect(importedCommands).toEqual([
      {
        sourceVersion: '2.0.0',
        stagedCursor: 'stcur_1',
        adaptedVersion: '3.0.0',
        adaptedSystemVersion: '3.0.0',
        adaptedPayload: '{"title":"v2:beta"}',
      },
      {
        sourceVersion: '1.0.0',
        stagedCursor: 'stcur_2',
        adaptedVersion: '3.0.0',
        adaptedSystemVersion: '3.0.0',
        adaptedPayload: '{"title":"v1:alpha"}',
      },
    ]);
    expect(migratedCommands).toEqual([
      {
        sourceGenerationId: 'gen_source_b',
        commandIds: ['cmd_source_b'],
      },
      {
        sourceGenerationId: 'gen_source_a',
        commandIds: ['cmd_source_a'],
      },
    ]);
  });

  it('releases the exact sole commission owner when predecessor catalog recording fails', async () => {
    const releaseTargetFrontendApi = vi.fn();
    const releaseTargetAcquisition = vi.fn(async () => encodeRight(undefined));
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({ replicaIndex: 0, stagedCommands: [] }),
      ),
      release: releaseTargetAcquisition,
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      importAdaptedFrontendCommands: vi.fn(async () =>
        encodeLeft(
          new ZerospinError({
            code: 'predecessor-catalog-write-rejected',
            message: 'The predecessor catalog write was rejected',
          }),
        ),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => targetPartitionApi),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_failed_predecessor_record',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_failed_record',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_failed_record',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_failed_record',
        generationId: 'gen_failed_record_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-failed-record-source',
      },
    });
    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );

    const result = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_failed_record',
          generationId: 'gen_failed_record_target',
          systemVersion: '3.0.0',
          accountId: 'acct_failed_record',
          accountName: targetFrontend.accountName,
          actorId: 'actr_failed_record',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'commissioned',
          commissionOwnerId: 'commission_failed_record',
          transportRegain: null,
          network: {
            releaseFrontendApi: releaseTargetFrontendApi,
            getFrontendState: vi.fn(async () => encodeRight({})),
            createFrontendWebSocketTicket: vi.fn(async () => encodeRight({})),
            pushCommands: vi.fn(async () => encodeRight({})),
          },
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('predecessor-catalog-write-rejected');
    }
    expect(
      targetPartitionApi.importAdaptedFrontendCommands,
    ).toHaveBeenCalledOnce();
    expect(releaseTargetAcquisition).toHaveBeenCalledOnce();
    expect(releaseTargetFrontendApi).toHaveBeenCalledOnce();

    await controller.release();
    expect(releaseTargetAcquisition).toHaveBeenCalledOnce();
    expect(releaseTargetFrontendApi).toHaveBeenCalledOnce();
  });

  it('keeps a mounted same-version source attached when the successor is only commissioned', async () => {
    const sourceRelease = vi.fn(async () => encodeRight(undefined));
    const targetRelease = vi.fn(async () => encodeRight(undefined));
    const replaceSourceFrontendState = vi.fn(async () => undefined);
    const setSourceRepairing = vi.fn();
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_commissioned_mount',
          generationId: 'gen_commissioned_source',
          systemVersion: '1.0.0',
          systemWorkerName: 'worker-commissioned-source',
          accountId: 'acct_commissioned_mount',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_commissioned_mount',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendIndex: 0,
          replicaIndex: 0,
          stagedCommands: [],
          resources: [],
        }),
      ),
      release: sourceRelease,
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_commissioned_mount',
          generationId: 'gen_commissioned_target',
          systemVersion: '1.0.0',
          systemWorkerName: 'worker-commissioned-target',
          accountId: 'acct_commissioned_mount',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_commissioned_mount',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendIndex: 1,
          replicaIndex: 0,
          stagedCommands: [],
          resources: [],
        }),
      ),
      release: targetRelease,
    };
    const sourcePartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(sourceAcquiredApi)),
      markFrontendCommandsMigrated: vi.fn(async () => encodeRight(undefined)),
      getDormantFrontendCommands: vi.fn(async () => encodeRight([])),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_commissioned_mount',
            accountName: sourceFrontendV1.accountName,
            actorId: 'actr_commissioned_mount',
            actorName: sourceFrontendV1.actorName,
            frontendName: sourceFrontendV1.frontendName,
            frontendVersion: sourceFrontendV1.version,
            databaseName: 'commissioned-source.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      importAdaptedFrontendCommands: vi.fn(async () =>
        encodeRight({ commandIds: [], replicaIndex: 0 }),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_commissioned_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_commissioned_mount',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const sourceAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_commissioned_mount',
          generationId: 'gen_commissioned_source',
          systemVersion: '1.0.0',
          accountId: 'acct_commissioned_mount',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_commissioned_mount',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const mountedSource = await Effect.runPromise(
      sourceAcquisition.hydrateSession({
        sessionId: 'sesn_commissioned_mount',
        replaceFrontendState: replaceSourceFrontendState,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: setSourceRepairing,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    const commissionedAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_commissioned_mount',
          generationId: 'gen_commissioned_target',
          systemVersion: '1.0.0',
          accountId: 'acct_commissioned_mount',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_commissioned_mount',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'commissioned',
          commissionOwnerId: 'commission_owner_mount',
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    // Commissioning may prepare and stream the target, but it cannot repoint
    // the mounted source database or release the source Config capability.
    expect(replaceSourceFrontendState).toHaveBeenCalledOnce();
    expect(setSourceRepairing).not.toHaveBeenCalled();
    expect(sourceRelease).not.toHaveBeenCalled();
    expect(
      targetPartitionApi.acquireFrontendReplica.mock.calls[0]?.[0].role,
    ).toBe('commissioned');
    expect(
      targetPartitionApi.importAdaptedFrontendCommands,
    ).toHaveBeenCalledOnce();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      })?.generationId,
    ).toBe('gen_commissioned_source');

    await Effect.runPromise(commissionedAcquisition.releaseCommissionOwner);
    expect(targetRelease).toHaveBeenCalledOnce();
    expect(sourceRelease).not.toHaveBeenCalled();

    await Effect.runPromise(mountedSource.release);
    await controller.release();
  });

  it('waits for an in-flight same-version source hydration before transferring that registration', async () => {
    const order: string[] = [];
    const sourceHydrationBarrier = Promise.withResolvers<void>();
    const sourceRelease = vi.fn(async () => {
      order.push('release-source');
      return encodeRight(undefined);
    });
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_hydration_transfer',
          generationId: 'gen_hydration_source',
          systemVersion: '1.0.0',
          systemWorkerName: 'worker-hydration-source',
          accountId: 'acct_hydration_transfer',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_hydration_transfer',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendIndex: 0,
          replicaIndex: 0,
          stagedCommands: [],
          resources: [],
        }),
      ),
      release: sourceRelease,
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_hydration_transfer',
          generationId: 'gen_hydration_target',
          systemVersion: '1.0.0',
          systemWorkerName: 'worker-hydration-target',
          accountId: 'acct_hydration_transfer',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_hydration_transfer',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendIndex: 1,
          replicaIndex: 0,
          stagedCommands: [],
          resources: [],
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(sourceAcquiredApi)),
      markFrontendCommandsMigrated: vi.fn(async () => encodeRight(undefined)),
      getDormantFrontendCommands: vi.fn(async () => encodeRight([])),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_hydration_transfer',
            accountName: sourceFrontendV1.accountName,
            actorId: 'actr_hydration_transfer',
            actorName: sourceFrontendV1.actorName,
            frontendName: sourceFrontendV1.frontendName,
            frontendVersion: sourceFrontendV1.version,
            databaseName: 'hydration-source.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      importAdaptedFrontendCommands: vi.fn(async () =>
        encodeRight({ commandIds: [], replicaIndex: 0 }),
      ),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_hydration_transfer',
            accountName: sourceFrontendV1.accountName,
            actorId: 'actr_hydration_transfer',
            actorName: sourceFrontendV1.actorName,
            frontendName: sourceFrontendV1.frontendName,
            frontendVersion: sourceFrontendV1.version,
            databaseName: 'hydration-target.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_hydration_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_hydration_transfer',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const frontendSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const frontendSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(frontendSpec),
    );
    const sourceAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_hydration_transfer',
          generationId: 'gen_hydration_source',
          systemVersion: '1.0.0',
          accountId: 'acct_hydration_transfer',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_hydration_transfer',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_hydration_transfer',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_hydration_transfer',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_hydration_transfer',
        generationId: 'gen_hydration_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-hydration-source',
      },
    });

    const replaceFrontendState = vi.fn(async frontendReplicaState => {
      if (frontendReplicaState.generationId === 'gen_hydration_source') {
        order.push('hydrate-source-start');
        await sourceHydrationBarrier.promise;
        order.push('hydrate-source-complete');
        return;
      }
      order.push('replace-target');
    });
    const sourceHydrationPromise = Effect.runPromise(
      sourceAcquisition.hydrateSession({
        sessionId: 'sesn_hydration_transfer',
        replaceFrontendState,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    await vi.waitFor(() =>
      expect(order).toEqual(['hydrate-source-start']),
    );

    let didResolveTargetAcquisition = false;
    const targetAcquisitionPromise = Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_hydration_transfer',
          generationId: 'gen_hydration_target',
          systemVersion: '1.0.0',
          accountId: 'acct_hydration_transfer',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_hydration_transfer',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec,
          frontendSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    ).then(acquisition => {
      didResolveTargetAcquisition = true;
      return acquisition;
    });

    await vi.waitFor(() =>
      expect(targetPartitionApi.acquireFrontendReplica).toHaveBeenCalled(),
    );
    expect(didResolveTargetAcquisition).toBe(false);
    expect(sourceRelease).not.toHaveBeenCalled();
    expect(replaceFrontendState).toHaveBeenCalledOnce();

    sourceHydrationBarrier.resolve();
    const mountedSource = await sourceHydrationPromise;
    await targetAcquisitionPromise;

    expect(order).toEqual([
      'hydrate-source-start',
      'hydrate-source-complete',
      'replace-target',
      'release-source',
    ]);
    expect(didResolveTargetAcquisition).toBe(true);
    expect(replaceFrontendState).toHaveBeenCalledTimes(2);
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      })?.generationId,
    ).toBe('gen_hydration_target');

    await Effect.runPromise(mountedSource.release);
    await controller.release();
  });

  it('uses source state transport and successor ticket transport only during source reconnect preflight', async () => {
    let sourceAcquireCount = 0;
    const releaseSourceFrontendApi = vi.fn();
    const releaseSuccessorFrontendApi = vi.fn();
    const getSourceFrontendState = vi.fn(async () =>
      encodeRight({
        systemId: 'sys_ticket_routing',
        generationId: 'gen_ticket_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-ticket-source',
        accountId: 'acct_ticket_routing',
        accountName: sourceFrontendV1.accountName,
        actorId: 'actr_ticket_routing',
        actorName: sourceFrontendV1.actorName,
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        frontendIndex: 0,
        replicaIndex: 0,
        stagedCommands: [],
        resources: [],
      }),
    );
    const createSourceTicket = vi.fn(async () =>
      encodeRight({
        systemId: 'sys_ticket_routing',
        generationId: 'gen_ticket_source',
        systemVersion: '1.0.0',
        accountId: 'acct_ticket_routing',
        accountName: sourceFrontendV1.accountName,
        actorId: 'actr_ticket_routing',
        actorName: sourceFrontendV1.actorName,
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        frontendIndex: 0,
        ticket: 'source-ticket',
      }),
    );
    const getSuccessorFrontendState = vi.fn(async () => encodeRight({}));
    const createSuccessorTicket = vi.fn(async () =>
      encodeRight({
        systemId: 'sys_ticket_routing',
        generationId: 'gen_ticket_target',
        systemVersion: '3.0.0',
        accountId: 'acct_ticket_routing',
        accountName: targetFrontend.accountName,
        actorId: 'actr_ticket_routing',
        actorName: targetFrontend.actorName,
        frontendName: targetFrontend.frontendName,
        frontendVersion: targetFrontend.version,
        frontendIndex: 1,
        ticket: 'successor-ticket',
      }),
    );
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({ replicaIndex: 0, stagedCommands: [] }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          stagedCommands: [],
          systemWorkerName: 'worker-ticket-target',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      acquireFrontendReplica: vi.fn(async props => {
        sourceAcquireCount += 1;
        if (sourceAcquireCount === 2) {
          // Reacquisition may need both operations. State remains bound to the
          // source authority; only ticket minting borrows successor transport.
          await props.provider.getFrontendState();
          await props.provider.createFrontendWebSocketTicket();
        }
        return encodeRight(sourceAcquiredApi);
      }),
      markFrontendCommandsMigrated: vi.fn(async () => encodeRight(undefined)),
      getDormantFrontendCommands: vi.fn(async () => encodeRight([])),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      importAdaptedFrontendCommands: vi.fn(async () =>
        encodeRight({ commandIds: [], replicaIndex: 0 }),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_ticket_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_ticket_routing',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const sourceSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const sourceSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_ticket_routing',
          generationId: 'gen_ticket_source',
          systemVersion: '1.0.0',
          accountId: 'acct_ticket_routing',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_ticket_routing',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec: sourceSpec,
          frontendSpecHash: sourceSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: {
            releaseFrontendApi: releaseSourceFrontendApi,
            getFrontendState: getSourceFrontendState,
            createFrontendWebSocketTicket: createSourceTicket,
            pushCommands: vi.fn(async () => encodeRight({})),
          },
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_ticket_routing',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_ticket_routing',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_ticket_routing',
        generationId: 'gen_ticket_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-ticket-source',
      },
    });

    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_ticket_routing',
          generationId: 'gen_ticket_target',
          systemVersion: '3.0.0',
          accountId: 'acct_ticket_routing',
          accountName: targetFrontend.accountName,
          actorId: 'actr_ticket_routing',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: {
            releaseFrontendApi: releaseSuccessorFrontendApi,
            getFrontendState: getSuccessorFrontendState,
            createFrontendWebSocketTicket: createSuccessorTicket,
            pushCommands: vi.fn(async () => encodeRight({})),
          },
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    expect(sourceAcquireCount).toBe(2);
    expect(getSourceFrontendState).toHaveBeenCalledOnce();
    expect(getSuccessorFrontendState).not.toHaveBeenCalled();
    expect(createSuccessorTicket).toHaveBeenCalledOnce();
    expect(createSourceTicket).not.toHaveBeenCalled();

    const sourceProvider =
      sourcePartitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (sourceProvider === undefined) {
      throw new Error('Expected the retained source provider capability');
    }
    await sourceProvider.createFrontendWebSocketTicket();

    // The preflight finalizer removes the temporary ticket route, restoring
    // ordinary source ticket ownership for later source-runtime requests.
    expect(createSuccessorTicket).toHaveBeenCalledOnce();
    expect(createSourceTicket).toHaveBeenCalledOnce();

    await controller.release();
    expect(releaseSourceFrontendApi).toHaveBeenCalledOnce();
    expect(releaseSuccessorFrontendApi).toHaveBeenCalledOnce();
  });

  it('retains every cross-version source session and marks existing and later hydration update-required', async () => {
    const sourceRelease = vi.fn(async () => encodeRight(undefined));
    const firstSourceUpdateRequired = vi.fn();
    const secondSourceUpdateRequired = vi.fn();
    const laterSourceUpdateRequired = vi.fn();
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_cross_version',
          generationId: 'gen_cross_version_source',
          systemVersion: '1.0.0',
          systemWorkerName: 'worker-cross-version-source',
          accountId: 'acct_cross_version',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_cross_version',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendIndex: 0,
          replicaIndex: 0,
          stagedCommands: [],
          resources: [],
        }),
      ),
      release: sourceRelease,
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_cross_version',
          generationId: 'gen_cross_version_target',
          systemVersion: '3.0.0',
          systemWorkerName: 'worker-cross-version-target',
          accountId: 'acct_cross_version',
          accountName: targetFrontend.accountName,
          actorId: 'actr_cross_version',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendIndex: 1,
          replicaIndex: 0,
          stagedCommands: [],
          resources: [],
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(sourceAcquiredApi)),
      markFrontendCommandsMigrated: vi.fn(async () => encodeRight(undefined)),
      getDormantFrontendCommands: vi.fn(async () => encodeRight([])),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_cross_version',
            accountName: sourceFrontendV1.accountName,
            actorId: 'actr_cross_version',
            actorName: sourceFrontendV1.actorName,
            frontendName: sourceFrontendV1.frontendName,
            frontendVersion: sourceFrontendV1.version,
            databaseName: 'cross-version-source.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      importAdaptedFrontendCommands: vi.fn(async () =>
        encodeRight({ commandIds: [], replicaIndex: 0 }),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_cross_version_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_cross_version',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const sourceSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const sourceSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceSpec),
    );
    const sourceAcquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_cross_version',
          generationId: 'gen_cross_version_source',
          systemVersion: '1.0.0',
          accountId: 'acct_cross_version',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_cross_version',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec: sourceSpec,
          frontendSpecHash: sourceSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    const firstMountedSource = await Effect.runPromise(
      sourceAcquisition.hydrateSession({
        sessionId: 'sesn_cross_version_first',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: firstSourceUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );
    const secondMountedSource = await Effect.runPromise(
      sourceAcquisition.hydrateSession({
        sessionId: 'sesn_cross_version_second',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: secondSourceUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_cross_version',
          generationId: 'gen_cross_version_target',
          systemVersion: '3.0.0',
          accountId: 'acct_cross_version',
          accountName: targetFrontend.accountName,
          actorId: 'actr_cross_version',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );

    expect(firstSourceUpdateRequired).toHaveBeenCalledOnce();
    expect(secondSourceUpdateRequired).toHaveBeenCalledOnce();
    expect(sourceRelease).not.toHaveBeenCalled();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      })?.generationId,
    ).toBe('gen_cross_version_source');

    const laterMountedSource = await Effect.runPromise(
      sourceAcquisition.hydrateSession({
        sessionId: 'sesn_cross_version_later',
        replaceFrontendState: async () => undefined,
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: laterSourceUpdateRequired,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    // Update-required is entry state, not a one-time notification limited to
    // Providers that happened to be mounted during target activation.
    expect(laterSourceUpdateRequired).toHaveBeenCalledOnce();
    expect(sourceRelease).not.toHaveBeenCalled();

    await Effect.runPromise(firstMountedSource.release);
    await Effect.runPromise(secondMountedSource.release);
    await Effect.runPromise(laterMountedSource.release);
    await controller.release();
  });

  it('releases the source acquisition and active locator only after target main-thread hydration', async () => {
    const order: string[] = [];
    const sourceRelease = vi.fn(async () => {
      order.push('release-source');
      return encodeRight(undefined);
    });
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({ replicaIndex: 0, stagedCommands: [] }),
      ),
      release: sourceRelease,
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          stagedCommands: [],
          systemWorkerName: 'worker-target',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(sourceAcquiredApi)),
      markFrontendCommandsMigrated: vi.fn(async () => encodeRight(undefined)),
      getDormantFrontendCommands: vi.fn(async () => encodeRight([])),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async () => encodeRight(targetAcquiredApi)),
      importAdaptedFrontendCommands: vi.fn(async () =>
        encodeRight({ commandIds: [], replicaIndex: 0 }),
      ),
      listAccountFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            accountId: 'acct_handoff',
            accountName: targetFrontend.accountName,
            actorId: 'actr_handoff',
            actorName: targetFrontend.actorName,
            frontendName: targetFrontend.frontendName,
            frontendVersion: targetFrontend.version,
            databaseName: 'target-replica.sqlite3',
            status: 'ready',
            role: 'active',
            sourceTargets: [],
          },
        ]),
      ),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_release_order',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const sourceSpec = makeFrontendControllerSpec(sourceFrontendV1);
    const sourceSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceSpec),
    );
    await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: sourceFrontendV1,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_handoff',
          generationId: 'gen_source',
          systemVersion: '1.0.0',
          accountId: 'acct_handoff',
          accountName: sourceFrontendV1.accountName,
          actorId: 'actr_handoff',
          actorName: sourceFrontendV1.actorName,
          frontendName: sourceFrontendV1.frontendName,
          frontendVersion: sourceFrontendV1.version,
          frontendSpec: sourceSpec,
          frontendSpecHash: sourceSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_handoff',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_handoff',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_handoff',
        generationId: 'gen_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker_source',
      },
    });
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://unrelated.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_handoff',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_handoff',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_handoff',
        generationId: 'gen_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker_source',
      },
    });

    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );
    const acquisition = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_handoff',
          generationId: 'gen_target',
          systemVersion: '3.0.0',
          accountId: 'acct_handoff',
          accountName: targetFrontend.accountName,
          actorId: 'actr_handoff',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.provide(NanoIdFactory)),
    );
    expect(sourceRelease).not.toHaveBeenCalled();

    await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_target',
        replaceFrontendState: async () => {
          order.push('hydrate-target');
        },
        handleFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    expect(order).toEqual(['hydrate-target', 'release-source']);
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      }),
    ).toBeNull();
    expect(
      controller.getCachedAccountFrontendLocator({
        apiUrl: 'https://unrelated.example.test',
        publishableKey: 'pk_test',
        frontend: sourceFrontendV1,
        role: 'active',
      }),
    ).not.toBeNull();
  });

  it('activates a service target before hydration and releases the source service acquisition last', async () => {
    const order: string[] = [];
    const targetRoles: string[] = [];
    const sourceRelease = vi.fn(async () => {
      order.push('release-source');
      return encodeRight(undefined);
    });
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_service_handoff',
          generationId: 'gen_service_source',
          systemVersion: '1.0.0',
          systemWorkerName: 'worker-service-source',
          serviceName: sourceServiceFrontend.serviceName,
          actorId: 'actr_service_handoff',
          actorName: sourceServiceFrontend.actorName,
          frontendName: sourceServiceFrontend.frontendName,
          frontendVersion: sourceServiceFrontend.version,
          frontendIndex: 0,
          replicaIndex: 0,
          resources: [],
        }),
      ),
      release: sourceRelease,
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          systemId: 'sys_service_handoff',
          generationId: 'gen_service_target',
          systemVersion: '2.0.0',
          systemWorkerName: 'worker-service-target',
          serviceName: targetServiceFrontend.serviceName,
          actorId: 'actr_service_handoff',
          actorName: targetServiceFrontend.actorName,
          frontendName: targetServiceFrontend.frontendName,
          frontendVersion: targetServiceFrontend.version,
          frontendIndex: 1,
          replicaIndex: 0,
          resources: [],
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      acquireServiceFrontendReplica: vi.fn(async () =>
        encodeRight(sourceAcquiredApi),
      ),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: sourceServiceFrontend.serviceName,
            actorId: 'actr_service_handoff',
            actorName: sourceServiceFrontend.actorName,
            frontendName: sourceServiceFrontend.frontendName,
            frontendVersion: sourceServiceFrontend.version,
            databaseName: 'source-service-replica.sqlite3',
            status: 'ready',
            role: 'active',
            pendingTransition: {
              kind: 'lineage-transition-required',
              systemId: 'sys_service_handoff',
              generationId: 'gen_service_target',
              serviceName: targetServiceFrontend.serviceName,
              actorId: 'actr_service_handoff',
              actorName: targetServiceFrontend.actorName,
              frontendName: targetServiceFrontend.frontendName,
              frontendVersion: targetServiceFrontend.version,
              appliedBoundaryIndex: 0,
              remainingBoundaries: [],
            },
          },
        ]),
      ),
    };
    const targetPartitionApi = {
      acquireServiceFrontendReplica: vi.fn(async props => {
        targetRoles.push(props.role);
        return encodeRight(targetAcquiredApi);
      }),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: targetServiceFrontend.serviceName,
            actorId: 'actr_service_handoff',
            actorName: targetServiceFrontend.actorName,
            frontendName: targetServiceFrontend.frontendName,
            frontendVersion: targetServiceFrontend.version,
            databaseName: 'target-service-replica.sqlite3',
            status: 'ready',
            role: 'active',
          },
        ]),
      ),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_service_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_service_release_order',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const sourceSpec = makeServiceFrontendControllerSpec(sourceServiceFrontend);
    const sourceSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceSpec),
    );
    await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: sourceServiceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_service_handoff',
        generationId: 'gen_service_source',
        systemVersion: '1.0.0',
        serviceName: sourceServiceFrontend.serviceName,
        actorId: 'actr_service_handoff',
        actorName: sourceServiceFrontend.actorName,
        frontendName: sourceServiceFrontend.frontendName,
        frontendVersion: sourceServiceFrontend.version,
        frontendSpec: sourceSpec,
        frontendSpecHash: sourceSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        transportRegain: null,
        network: null,
      }),
    );
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceServiceFrontend,
      role: 'active',
      identity: {
        systemName: sourceServiceFrontend.systemName,
        serviceName: sourceServiceFrontend.serviceName,
        actorName: sourceServiceFrontend.actorName,
        actorId: 'actr_service_handoff',
        frontendName: sourceServiceFrontend.frontendName,
        frontendVersion: sourceServiceFrontend.version,
        systemId: 'sys_service_handoff',
        generationId: 'gen_service_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-service-source',
      },
    });
    now.mockReturnValue(86_401_001);

    const targetSpec = makeServiceFrontendControllerSpec(targetServiceFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );
    const acquisition = await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: targetServiceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_service_handoff',
        generationId: 'gen_service_target',
        systemVersion: '2.0.0',
        serviceName: targetServiceFrontend.serviceName,
        actorId: 'actr_service_handoff',
        actorName: targetServiceFrontend.actorName,
        frontendName: targetServiceFrontend.frontendName,
        frontendVersion: targetServiceFrontend.version,
        frontendSpec: targetSpec,
        frontendSpecHash: targetSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        transportRegain: null,
        network: null,
      }),
    );

    expect(targetRoles).toEqual(['commissioned', 'active']);
    expect(sourceRelease).not.toHaveBeenCalled();
    await Effect.runPromise(
      acquisition.hydrateSession({
        sessionId: 'sesn_service_target',
        replaceFrontendState: async () => {
          order.push('hydrate-target');
        },
        handleServiceFrontendReplicaBlock: async () => undefined,
        setDatabaseName: () => undefined,
        setOnline: () => undefined,
        setRepairing: () => undefined,
        setUpdateRequired: () => undefined,
        setFailure: () => undefined,
        teardown: async () => undefined,
      }),
    );

    expect(order).toEqual(['hydrate-target', 'release-source']);
    expect(
      controller.getCachedServiceFrontendLocator({
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        frontend: sourceServiceFrontend,
        role: 'active',
      }),
    ).toBeNull();
  });

  it('activates a same-generation service version from an exact ready active source without a persisted lineage transition', async () => {
    const targetRoles: string[] = [];
    const sourceAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          systemWorkerName: 'worker-service-same-generation',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({
          replicaIndex: 0,
          systemWorkerName: 'worker-service-same-generation',
        }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(async props => {
        if (props.frontendVersion === sourceServiceFrontend.version) {
          return encodeRight(sourceAcquiredApi);
        }
        targetRoles.push(props.role);
        return encodeRight(targetAcquiredApi);
      }),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () =>
        encodeRight([
          {
            serviceName: sourceServiceFrontend.serviceName,
            actorId: 'actr_service_same_generation',
            actorName: sourceServiceFrontend.actorName,
            frontendName: sourceServiceFrontend.frontendName,
            frontendVersion: sourceServiceFrontend.version,
            databaseName: 'source-service-same-generation.sqlite3',
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
      partitionKey: 'partition_service_same_generation',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    const sourceSpec = makeServiceFrontendControllerSpec(sourceServiceFrontend);
    const sourceSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(sourceSpec),
    );
    await Effect.runPromise(
      controller.acquireServiceFrontendReplica({
        frontend: sourceServiceFrontend,
        apiUrl: 'https://api.example.test',
        publishableKey: 'pk_test',
        systemId: 'sys_service_same_generation',
        generationId: 'gen_service_same_generation',
        systemVersion: '1.0.0',
        serviceName: sourceServiceFrontend.serviceName,
        actorId: 'actr_service_same_generation',
        actorName: sourceServiceFrontend.actorName,
        frontendName: sourceServiceFrontend.frontendName,
        frontendVersion: sourceServiceFrontend.version,
        frontendSpec: sourceSpec,
        frontendSpecHash: sourceSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        transportRegain: null,
        network: null,
      }),
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedServiceFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceServiceFrontend,
      role: 'active',
      identity: {
        systemName: sourceServiceFrontend.systemName,
        serviceName: sourceServiceFrontend.serviceName,
        actorName: sourceServiceFrontend.actorName,
        actorId: 'actr_service_same_generation',
        frontendName: sourceServiceFrontend.frontendName,
        frontendVersion: sourceServiceFrontend.version,
        systemId: 'sys_service_same_generation',
        generationId: 'gen_service_same_generation',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker-service-same-generation',
      },
    });

    const targetSpec = makeServiceFrontendControllerSpec(targetServiceFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );
    const result = await Effect.runPromise(
      controller
        .acquireServiceFrontendReplica({
          frontend: targetServiceFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_service_same_generation',
          generationId: 'gen_service_same_generation',
          systemVersion: '1.0.0',
          serviceName: targetServiceFrontend.serviceName,
          actorId: 'actr_service_same_generation',
          actorName: targetServiceFrontend.actorName,
          frontendName: targetServiceFrontend.frontendName,
          frontendVersion: targetServiceFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: null,
        })
        .pipe(Effect.either),
    );

    expect(Either.isRight(result)).toBe(true);
    expect(targetRoles).toEqual(['commissioned', 'active']);
    expect(partitionApi.listServiceFrontendReplicas).toHaveBeenCalledOnce();
    await controller.release();
  });

  it('retains the commissioned target network until Config release when source lineage preflight fails after insertion', async () => {
    const acquiredRoles: string[] = [];
    const getDormantFrontendCommands = vi.fn();
    const importAdaptedFrontendCommands = vi.fn();
    const releaseTargetFrontendApi = vi.fn();
    const targetAcquiredApi = {
      getFrontendState: vi.fn(async () =>
        encodeRight({ replicaIndex: 0, stagedCommands: [] }),
      ),
      release: vi.fn(async () => encodeRight(undefined)),
    };
    const sourcePartitionApi = {
      markFrontendCommandsMigrated: vi.fn(async () =>
        encodeLeft(
          new ZerospinError({
            code: 'frontend-journal-migration-lineage-unverified',
            message: 'The target is not in this source lineage',
          }),
        ),
      ),
      getDormantFrontendCommands,
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const targetPartitionApi = {
      acquireFrontendReplica: vi.fn(async props => {
        acquiredRoles.push(props.role);
        return encodeRight(targetAcquiredApi);
      }),
      importAdaptedFrontendCommands,
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    makeSharedWorkerSessionMock.mockImplementation(props =>
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () =>
            props.generationId === 'gen_source'
              ? sourcePartitionApi
              : targetPartitionApi,
          ),
        },
        release: Effect.void,
      }),
    );

    const controller = makeBrowserPartitionController({
      partitionKey: 'partition_rejected_handoff',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => undefined,
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    controller.setCachedAccountFrontendLocator({
      apiUrl: 'https://api.example.test',
      publishableKey: 'pk_test',
      frontend: sourceFrontendV1,
      role: 'active',
      identity: {
        systemName: sourceFrontendV1.systemName,
        accountName: sourceFrontendV1.accountName,
        accountId: 'acct_handoff',
        actorName: sourceFrontendV1.actorName,
        actorId: 'actr_handoff',
        frontendName: sourceFrontendV1.frontendName,
        frontendVersion: sourceFrontendV1.version,
        systemId: 'sys_handoff',
        generationId: 'gen_source',
        systemVersion: '1.0.0',
        systemWorkerName: 'worker_source',
      },
    });
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const targetSpec = makeFrontendControllerSpec(targetFrontend);
    const targetSpecHash = await Effect.runPromise(
      makeFrontendSpecHash(targetSpec),
    );

    const result = await Effect.runPromise(
      controller
        .acquireAccountFrontendReplica({
          frontend: targetFrontend,
          apiUrl: 'https://api.example.test',
          publishableKey: 'pk_test',
          systemId: 'sys_handoff',
          generationId: 'gen_unrelated',
          systemVersion: '3.0.0',
          accountId: 'acct_handoff',
          accountName: targetFrontend.accountName,
          actorId: 'actr_handoff',
          actorName: targetFrontend.actorName,
          frontendName: targetFrontend.frontendName,
          frontendVersion: targetFrontend.version,
          frontendSpec: targetSpec,
          frontendSpecHash: targetSpecHash,
          authority: 'online',
          role: 'active',
          commissionOwnerId: null,
          transportRegain: null,
          network: {
            releaseFrontendApi: releaseTargetFrontendApi,
            getFrontendState: vi.fn(async () => encodeRight({})),
            createFrontendWebSocketTicket: vi.fn(async () => encodeRight({})),
            pushCommands: vi.fn(async () => encodeRight({})),
          },
        })
        .pipe(Effect.provide(NanoIdFactory), Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe(
        'frontend-journal-migration-lineage-unverified',
      );
    }
    expect(acquiredRoles).toEqual(['commissioned']);
    expect(getDormantFrontendCommands).not.toHaveBeenCalled();
    expect(importAdaptedFrontendCommands).not.toHaveBeenCalled();
    expect(releaseTargetFrontendApi).not.toHaveBeenCalled();

    // The failed activation deliberately retains the commissioned target.
    // Config teardown, not the rejected caller, releases its network exactly once.
    await controller.release();
    expect(releaseTargetFrontendApi).toHaveBeenCalledOnce();
  });
});
