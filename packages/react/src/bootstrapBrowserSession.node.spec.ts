import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeModel } from '@zerospin/core/models/makeModel';
import { primitives } from '@zerospin/core/models/primitives';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeSession } from '@zerospin/core/session/makeSession';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import type * as Capnweb from 'capnweb';
import { Effect, Either, Layer, Redacted, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { bootstrapBrowserSession } from './bootstrapBrowserSession';
import { makeBrowserPartitionController } from './makeBrowserPartitionController';

const newWebSocketRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());
const rpcSessionDisposeMock = vi.hoisted(() => vi.fn());

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newWebSocketRpcSession: newWebSocketRpcSessionMock,
  };
});

const Account = makeModel(
  {
    abbreviation: 'acct',
    modelName: 'account',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const frontend = makeFrontendController({
  contracts: {},
  models: {
    account: Account,
    user: User,
  },
  accountName: 'main',
  actorName: 'testFrontend',
  frontendName: 'default',
  version: '1.0.0',
  systemName: 'test-system',
  signature: Schema.Struct({}),
});

const frontendV2 = makeFrontendController({
  contracts: {},
  models: {
    account: Account,
    user: User,
  },
  accountName: frontend.accountName,
  actorName: frontend.actorName,
  frontendName: frontend.frontendName,
  version: '2.0.0',
  systemName: frontend.systemName,
  signature: Schema.Struct({}),
});

const frontendState = {
  accountId: 'acct_1',
  actorId: 'actr_1',
  systemId: 'sys_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  accountName: frontend.accountName,
  actorName: frontend.actorName,
  frontendName: frontend.frontendName,
  systemWorkerName: 'stub-deploy',
  frontendIndex: 0,
  lastRebasedPushedCursor: null,
  pushedCommands: [],
  resources: [],
  executedPushedCommands: [],
  failedPushedCommands: [],
};

const telemetryCollector = makeTelemetryCollector();

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('bootstrapBrowserSession'),
  IncrementalMonotonicFactory,
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  AsyncLive,
  makeTelemetryLayer(telemetryCollector),
  TestContext,
);

describe('bootstrapBrowserSession', () => {
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    telemetryCollector.flush();
    vi.mocked(mockFrontendApi.makeFrontendSpec).mockReset();
    vi.mocked(mockFrontendApi.makeFrontendSpec).mockResolvedValue({
      result: encodeRight(makeFrontendControllerSpec(frontend)),
      link: null,
    });
    vi.mocked(mockFrontendApi.getFrontendState).mockReset();
    vi.mocked(mockFrontendApi.getFrontendState).mockImplementation(
      async () => ({
        result: encodeRight({
          accountId: frontendState.accountId,
          actorId: frontendState.actorId,
          systemId: frontendState.systemId,
          generationId: frontendState.generationId,
          systemVersion: frontendState.systemVersion,
          accountName: frontendState.accountName,
          actorName: frontendState.actorName,
          frontendName: frontendState.frontendName,
          systemWorkerName: frontendState.systemWorkerName,
          frontendIndex: frontendState.frontendIndex,
          lastRebasedPushedCursor: null,
          pushedCommands: [],
          resources: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        }),
        link: null,
      }),
    );
    vi.mocked(mockFrontendApi.fetchActor).mockReset();
    vi.mocked(mockFrontendApi.fetchActor).mockResolvedValue({
      result: encodeRight({
        actor: {
          accountId: 'acct_1',
          actorId: 'actr_1',
        },
        deployId: 'dpl_1',
        generationId: 'gen_1',
        systemId: 'sys_1',
        systemVersion: '1.0.0',
        systemWorkerName: 'stub-deploy',
        systemEnvironmentId: 'dev',
      }),
      link: null,
    });
    vi.mocked(mockFrontendApi.createFrontendWebSocketTicket).mockReset();
    vi.mocked(mockFrontendApi.createFrontendWebSocketTicket).mockResolvedValue({
      result: encodeRight({
        ticket: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        systemId: frontendState.systemId,
        generationId: frontendState.generationId,
        accountId: frontendState.accountId,
        accountName: frontendState.accountName,
        actorId: frontendState.actorId,
        actorName: frontendState.actorName,
        frontendName: frontendState.frontendName,
        frontendVersion: frontend.version,
      }),
      link: null,
    });
    vi.mocked(mockFrontendApi.pushCommands).mockReset();
    vi.mocked(mockFrontendApi.pushCommands).mockResolvedValue({
      result: encodeRight({
        pendingCommands: [],
        pushedCommands: [],
        failedCommands: [],
      }),
      link: null,
    });
    getFrontendApi.mockReset();
    getFrontendApi.mockImplementation(() => ({
      ...mockFrontendApi,
      [Symbol.dispose]: () => {
        /* Bound frontend capability dispose (no-op in tests). */
      },
    }));
    newWebSocketRpcSessionMock.mockReset();
    rpcSessionDisposeMock.mockReset();
    newWebSocketRpcSessionMock.mockImplementation(() => ({
      getFrontendApi,
      [Symbol.dispose]: rpcSessionDisposeMock,
    }));
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates and releases a distinct capability for every shared-worker provider call',
      () =>
        Effect.gen(function* () {
          const generateSignature = vi.fn(() => Effect.succeed({}));
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_fresh_account_capabilities',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'account', frontend },
              generateSignature,
            }),
          });
          const acquireAccountFrontendReplica = vi
            .spyOn(
              browserPartitionController,
              'acquireAccountFrontendReplica',
            )
            .mockImplementation(() =>
              Effect.succeed({
                hydrateSession: hydrateProps =>
                  Effect.promise(async () => {
                    const frontendReplicaState = {
                      ...frontendState,
                      frontendVersion: frontend.version,
                      replicaIndex: 0,
                      stagedCommands: [],
                      failedStagedCommands: [],
                      optimisticAppliedMutations: [],
                    };
                    await hydrateProps.replaceFrontendState(
                      frontendReplicaState,
                    );
                    hydrateProps.setDatabaseName(
                      'fresh-account-capabilities.sqlite3',
                    );
                    return {
                      frontendReplicaState,
                      databaseName: 'fresh-account-capabilities.sqlite3',
                      release: Effect.promise(() =>
                        hydrateProps.teardown(null),
                      ),
                    };
                  }),
                releaseCommissionOwner: Effect.void,
              }),
            );
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedAccountFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature,
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserPartitionController,
          });
          const network =
            acquireAccountFrontendReplica.mock.calls[0]?.[0].network;
          if (network === null || network === undefined) {
            throw new Error(
              'Expected the shared-worker acquisition to receive a network provider',
            );
          }

          yield* Effect.promise(() => network.getFrontendState());
          yield* Effect.promise(() =>
            network.createFrontendWebSocketTicket(),
          );
          yield* Effect.promise(() => network.pushCommands([]));
          vi.mocked(mockFrontendApi.getFrontendState).mockResolvedValueOnce({
            result: encodeLeft(
              new ZerospinError({
                code: 'frontend-state-required',
                message:
                  'Worker requested ordinary state repair for an operational gap',
              }),
            ),
            link: null,
          });
          yield* Effect.promise(() => network.getFrontendState());

          expect(generateSignature).toHaveBeenCalledTimes(5);
          expect(newWebSocketRpcSessionMock).toHaveBeenCalledTimes(5);
          expect(getFrontendApi).toHaveBeenCalledTimes(5);
          expect(rpcSessionDisposeMock).toHaveBeenCalledTimes(5);
          expect(mockFrontendApi.getFrontendState).toHaveBeenCalledTimes(2);
          expect(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledTimes(1);
          expect(mockFrontendApi.pushCommands).toHaveBeenCalledTimes(1);
          expect(invalidateCachedLocators).not.toHaveBeenCalled();

          yield* bootstrapResult.releaseBrowserSession;
        }),
    );

    it.effect(
      'hands an online account generation successor to a second active acquisition with fresh network capabilities',
      () =>
        Effect.gen(function* () {
          const releaseInitialFrontendApi = vi.fn();
          const releaseRegainedFrontendApi = vi.fn();
          const releaseStateFrontendApi = vi.fn();
          const releaseTicketFrontendApi = vi.fn();
          const releasePushFrontendApi = vi.fn();
          const releaseInitialRpcSession = vi.fn();
          const releaseRegainedRpcSession = vi.fn();
          const releaseStateRpcSession = vi.fn();
          const releaseTicketRpcSession = vi.fn();
          const releasePushRpcSession = vi.fn();
          const initialFrontendApi = {
            ...mockFrontendApi,
            [Symbol.dispose]: releaseInitialFrontendApi,
          };
          const regainedFrontendApi = {
            ...mockFrontendApi,
            [Symbol.dispose]: releaseRegainedFrontendApi,
          };
          const stateFrontendApi = {
            ...mockFrontendApi,
            [Symbol.dispose]: releaseStateFrontendApi,
          };
          const ticketFrontendApi = {
            ...mockFrontendApi,
            [Symbol.dispose]: releaseTicketFrontendApi,
          };
          const pushFrontendApi = {
            ...mockFrontendApi,
            [Symbol.dispose]: releasePushFrontendApi,
          };
          getFrontendApi
            .mockReturnValueOnce(initialFrontendApi)
            .mockReturnValueOnce(regainedFrontendApi)
            .mockReturnValueOnce(stateFrontendApi)
            .mockReturnValueOnce(ticketFrontendApi)
            .mockReturnValueOnce(pushFrontendApi);
          newWebSocketRpcSessionMock
            .mockReturnValueOnce({
              getFrontendApi,
              [Symbol.dispose]: releaseInitialRpcSession,
            })
            .mockReturnValueOnce({
              getFrontendApi,
              [Symbol.dispose]: releaseRegainedRpcSession,
            })
            .mockReturnValueOnce({
              getFrontendApi,
              [Symbol.dispose]: releaseStateRpcSession,
            })
            .mockReturnValueOnce({
              getFrontendApi,
              [Symbol.dispose]: releaseTicketRpcSession,
            })
            .mockReturnValueOnce({
              getFrontendApi,
              [Symbol.dispose]: releasePushRpcSession,
            });
          vi.mocked(mockFrontendApi.fetchActor).mockResolvedValue({
            result: encodeRight({
              actor: {
                accountId: frontendState.accountId,
                actorId: frontendState.actorId,
              },
              deployId: 'dpl_2',
              generationId: 'gen_2',
              systemId: frontendState.systemId,
              systemVersion: '2.0.0',
              systemWorkerName: 'worker-v2',
              systemEnvironmentId: 'dev',
            }),
            link: null,
          });
          vi.mocked(mockFrontendApi.fetchActor).mockResolvedValueOnce({
            result: encodeRight({
              actor: {
                accountId: frontendState.accountId,
                actorId: frontendState.actorId,
              },
              deployId: 'dpl_1',
              generationId: frontendState.generationId,
              systemId: frontendState.systemId,
              systemVersion: frontendState.systemVersion,
              systemWorkerName: frontendState.systemWorkerName,
              systemEnvironmentId: 'dev',
            }),
            link: null,
          });
          vi.mocked(mockFrontendApi.getFrontendState).mockResolvedValue({
            result: encodeRight({
              ...frontendState,
              generationId: 'gen_2',
              systemVersion: '2.0.0',
              systemWorkerName: 'worker-v2',
            }),
            link: null,
          });
          vi.mocked(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).mockResolvedValue({
            result: encodeRight({
              ticket: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
              systemId: frontendState.systemId,
              generationId: 'gen_2',
              accountId: frontendState.accountId,
              accountName: frontendState.accountName,
              actorId: frontendState.actorId,
              actorName: frontendState.actorName,
              frontendName: frontendState.frontendName,
              frontendVersion: frontend.version,
            }),
            link: null,
          });
          const generateSignature = vi.fn(() => Effect.succeed({}));
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_online_account_successor',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'account', frontend },
              generateSignature,
            }),
          });
          const acquireAccountFrontendReplica = vi
            .spyOn(
              browserPartitionController,
              'acquireAccountFrontendReplica',
            )
            .mockImplementation(() =>
              Effect.succeed({
                hydrateSession: hydrateProps =>
                  Effect.promise(async () => {
                    const frontendReplicaState = {
                      ...frontendState,
                      frontendVersion: frontend.version,
                      replicaIndex: 0,
                      stagedCommands: [],
                      failedStagedCommands: [],
                      optimisticAppliedMutations: [],
                    };
                    await hydrateProps.replaceFrontendState(
                      frontendReplicaState,
                    );
                    hydrateProps.setDatabaseName(
                      'online-account-successor.sqlite3',
                    );
                    return {
                      frontendReplicaState,
                      databaseName: 'online-account-successor.sqlite3',
                      release: Effect.promise(() =>
                        hydrateProps.teardown(null),
                      ),
                    };
                  }),
                releaseCommissionOwner: Effect.void,
              }),
            );
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedAccountFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature,
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserPartitionController,
          });
          const initialAcquisitionProps =
            acquireAccountFrontendReplica.mock.calls[0]?.[0];
          if (
            initialAcquisitionProps === undefined ||
            initialAcquisitionProps.transportRegain === null
          ) {
            throw new Error(
              'Expected the online account acquisition to retain a transport-regain callback',
            );
          }

          yield* Effect.promise(() =>
            initialAcquisitionProps.transportRegain(),
          );

          expect(acquireAccountFrontendReplica).toHaveBeenCalledTimes(2);
          const successorAcquisitionProps =
            acquireAccountFrontendReplica.mock.calls[1]?.[0];
          expect(successorAcquisitionProps).toMatchObject({
            generationId: 'gen_2',
            systemVersion: '2.0.0',
            authority: 'online',
            role: 'active',
            transportRegain: null,
          });
          if (
            successorAcquisitionProps === undefined ||
            successorAcquisitionProps.network === null
          ) {
            throw new Error(
              'Expected the account successor acquisition to receive a network provider',
            );
          }

          yield* Effect.promise(() =>
            successorAcquisitionProps.network.getFrontendState(),
          );
          yield* Effect.promise(() =>
            successorAcquisitionProps.network.createFrontendWebSocketTicket(),
          );
          yield* Effect.promise(() =>
            successorAcquisitionProps.network.pushCommands([]),
          );

          expect(generateSignature).toHaveBeenCalledTimes(5);
          expect(newWebSocketRpcSessionMock).toHaveBeenCalledTimes(5);
          expect(getFrontendApi).toHaveBeenCalledTimes(5);
          expect(releaseInitialFrontendApi).toHaveBeenCalledOnce();
          expect(releaseRegainedFrontendApi).toHaveBeenCalledOnce();
          expect(releaseStateFrontendApi).toHaveBeenCalledOnce();
          expect(releaseTicketFrontendApi).toHaveBeenCalledOnce();
          expect(releasePushFrontendApi).toHaveBeenCalledOnce();
          expect(releaseInitialRpcSession).toHaveBeenCalledOnce();
          expect(releaseRegainedRpcSession).toHaveBeenCalledOnce();
          expect(releaseStateRpcSession).toHaveBeenCalledOnce();
          expect(releaseTicketRpcSession).toHaveBeenCalledOnce();
          expect(releasePushRpcSession).toHaveBeenCalledOnce();
          expect(mockFrontendApi.getFrontendState).toHaveBeenCalledOnce();
          expect(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledOnce();
          expect(mockFrontendApi.pushCommands).toHaveBeenCalledOnce();
          expect(invalidateCachedLocators).not.toHaveBeenCalled();

          yield* bootstrapResult.releaseBrowserSession;
        }),
    );

    it.effect('hydrates the session database with fetched frontendState', () =>
      Effect.gen(function* () {
        let messageListener: ((event: { data: unknown }) => void) | undefined;
        const closeMock = vi.fn();
        const sendMock = vi.fn(() => {
          queueMicrotask(() => {
            messageListener?.({
              data: JSON.stringify({
                type: 'replay-complete',
                generationId: frontendState.generationId,
                frontendIndex: frontendState.frontendIndex,
              }),
            });
          });
        });
        const addEventListenerMock = vi.fn<
          (type: string, listener: (event: { data: unknown }) => void) => void
        >((type, listener) => {
          if (type === 'message') {
            messageListener = listener;
          }
          if (type === 'open') {
            queueMicrotask(() => listener({ data: undefined }));
          }
        });
        const WebSocketMock = vi.fn(function (
          this: {
            addEventListener: typeof addEventListenerMock;
            close: typeof closeMock;
            send: typeof sendMock;
          },
          _url: string,
        ) {
          this.addEventListener = addEventListenerMock;
          this.close = closeMock;
          this.send = sendMock;
        });
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: { WebSocket: WebSocketMock },
        });
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        const session = makeSession({
          frontend,
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          sessionId,
        });
        const browserPartitionController = makeBrowserPartitionController({
          partitionKey: 'partition_1',
          getFrontendAuthenticator: () => ({
            frontend: { kind: 'account', frontend },
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          }),
        });
        const setCachedLocator = vi.spyOn(
          browserPartitionController,
          'setCachedAccountFrontendLocator',
        );
        const invalidateCachedLocators = vi.spyOn(
          browserPartitionController,
          'invalidateCachedAccountFrontendLocators',
        );

        const bootstrapResult = yield* bootstrapBrowserSession({
          session,
          browserPartitionController,
        });
        const closeDatabase = vi.spyOn(
          bootstrapResult.db.$client.sqlite3,
          'close',
        );

        expect(mockFrontendApi.getFrontendState).toHaveBeenCalledTimes(1);
        expect(session.store.getState().vfsName).toBe(null);
        expect(getInitializedStateOrThrow({ session }).isInitialized).toBe(
          true,
        );
        expect(rpcSessionDisposeMock).not.toHaveBeenCalled();
        expect(setCachedLocator).not.toHaveBeenCalled();
        expect(invalidateCachedLocators).not.toHaveBeenCalled();
        yield* bootstrapResult.releaseBrowserSession;
        expect(closeMock).toHaveBeenCalledTimes(1);
        expect(closeDatabase).toHaveBeenCalledWith(
          bootstrapResult.db.$client.db,
        );
        expect(rpcSessionDisposeMock).toHaveBeenCalledTimes(1);
      }),
    );

    it.effect(
      'rejects direct bootstrap when browser WebSocket is unavailable',
      () =>
        Effect.gen(function* () {
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserPartitionController: makeBrowserPartitionController({
              partitionKey: 'partition_1',
              getFrontendAuthenticator: () => ({
                frontend: { kind: 'account', frontend },
                generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
              }),
            }),
          }).pipe(Effect.either);

          expect(Either.isLeft(bootstrapResult)).toBe(true);
          if (Either.isLeft(bootstrapResult)) {
            expect(bootstrapResult.left.code).toBe(
              'frontend-websocket-unavailable',
            );
          }
          expect(rpcSessionDisposeMock).toHaveBeenCalledTimes(1);
        }),
      15_000,
    );

    it.effect('reports operational fetchActor failures without revoking cached authority', () =>
      Effect.gen(function* () {
        vi.mocked(mockFrontendApi.fetchActor).mockResolvedValueOnce({
          result: encodeLeft(
            new ZerospinError({
              code: 'fetch-actor-test-failure',
              message: 'Fetch actor failed in test',
            }),
          ),
          link: null,
        });

        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        const session = makeSession({
          frontend,
          generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          sessionId,
        });
        const browserPartitionController = makeBrowserPartitionController({
          partitionKey: 'partition_authority_revocation',
          getFrontendAuthenticator: () => ({
            frontend: { kind: 'account', frontend },
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
          }),
        });
        browserPartitionController.setCachedAccountFrontendLocator({
          apiUrl: 'https://api.example.com/',
          publishableKey: 'pk_test',
          frontend,
          role: 'active',
          identity: {
            systemName: frontend.systemName,
            accountName: frontend.accountName,
            accountId: 'acct_1',
            actorName: frontend.actorName,
            actorId: 'actr_1',
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            systemId: 'sys_1',
            generationId: 'gen_1',
            systemVersion: '1.0.0',
            systemWorkerName: 'stub-deploy',
          },
        });
        const invalidateCachedLocators = vi.spyOn(
          browserPartitionController,
          'invalidateCachedAccountFrontendLocators',
        );

        const maybeBootstrap = yield* bootstrapBrowserSession({
          session,
          browserPartitionController,
        }).pipe(Effect.either);

        expect(Either.isLeft(maybeBootstrap)).toBe(true);
        if (Either.isLeft(maybeBootstrap)) {
          expect(maybeBootstrap.left.code).toBe('fetch-actor-test-failure');
          expect(maybeBootstrap.left.message).toBe(
            'fetch-actor-test-failure: Fetch actor failed in test',
          );
        }
        expect(invalidateCachedLocators).not.toHaveBeenCalled();
        expect(
          browserPartitionController.getCachedAccountFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
          }),
        ).not.toBeNull();
        expect(rpcSessionDisposeMock).toHaveBeenCalledTimes(1);
      }),
    );

    it.effect(
      'invalidates every direct-mode account locator after local signature rejection',
      () =>
        Effect.gen(function* () {
          vi.mocked(mockFrontendApi.fetchActor).mockResolvedValueOnce({
            result: encodeLeft(
              new ZerospinError({
                code: 'frontend-local-signature-invalid',
                message: 'Account signature did not match the local schema',
              }),
            ),
            link: null,
          });
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_direct_account_revocation',
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'account', frontend },
              generateSignature: () => Effect.succeed({}),
            }),
          });
          browserPartitionController.setCachedAccountFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
            identity: {
              systemName: frontend.systemName,
              accountName: frontend.accountName,
              accountId: 'acct_1',
              actorName: frontend.actorName,
              actorId: 'actr_1',
              frontendName: frontend.frontendName,
              frontendVersion: frontend.version,
              systemId: 'sys_1',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'worker-v1',
            },
          });
          browserPartitionController.setCachedAccountFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend: frontendV2,
            role: 'commissioned',
            identity: {
              systemName: frontendV2.systemName,
              accountName: frontendV2.accountName,
              accountId: 'acct_1',
              actorName: frontendV2.actorName,
              actorId: 'actr_1',
              frontendName: frontendV2.frontendName,
              frontendVersion: frontendV2.version,
              systemId: 'sys_1',
              generationId: 'gen_2',
              systemVersion: '2.0.0',
              systemWorkerName: 'worker-v2',
            },
          });
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedAccountFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature: () => Effect.succeed({}),
            sessionId,
          });

          const result = yield* bootstrapBrowserSession({
            session,
            browserPartitionController,
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          expect(invalidateCachedLocators).toHaveBeenCalledOnce();
          expect(
            browserPartitionController.getCachedAccountFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend,
              role: 'active',
            }),
          ).toBeNull();
          expect(
            browserPartitionController.getCachedAccountFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend: frontendV2,
              role: 'commissioned',
            }),
          ).toBeNull();
        }),
    );

    it.effect(
      'preserves every cached locator when admission finds only a same-principal frontend version change',
      () =>
        Effect.gen(function* () {
          vi.mocked(mockFrontendApi.makeFrontendSpec).mockResolvedValueOnce({
            result: encodeRight(makeFrontendControllerSpec(frontendV2)),
            link: null,
          });
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_account_version_change',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'account', frontend },
              generateSignature: () => Effect.succeed({}),
            }),
          });
          browserPartitionController.setCachedAccountFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
            identity: {
              systemName: frontend.systemName,
              accountName: frontend.accountName,
              accountId: 'acct_1',
              actorName: frontend.actorName,
              actorId: 'actr_1',
              frontendName: frontend.frontendName,
              frontendVersion: frontend.version,
              systemId: 'sys_1',
              generationId: 'gen_1',
              systemVersion: '1.0.0',
              systemWorkerName: 'worker-v1',
            },
          });
          browserPartitionController.setCachedAccountFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend: frontendV2,
            role: 'commissioned',
            identity: {
              systemName: frontendV2.systemName,
              accountName: frontendV2.accountName,
              accountId: 'acct_1',
              actorName: frontendV2.actorName,
              actorId: 'actr_1',
              frontendName: frontendV2.frontendName,
              frontendVersion: frontendV2.version,
              systemId: 'sys_1',
              generationId: 'gen_2',
              systemVersion: '2.0.0',
              systemWorkerName: 'worker-v2',
            },
          });
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedAccountFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature: () => Effect.succeed({}),
            sessionId,
          });

          const result = yield* bootstrapBrowserSession({
            session,
            browserPartitionController,
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left.code).toBe('frontend-admission-target-mismatch');
          }
          expect(invalidateCachedLocators).not.toHaveBeenCalled();
          expect(
            browserPartitionController.getCachedAccountFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend,
              role: 'active',
            }),
          ).not.toBeNull();
          expect(
            browserPartitionController.getCachedAccountFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend: frontendV2,
              role: 'commissioned',
            }),
          ).not.toBeNull();
        }),
    );

    it.effect(
      'reconnects when the frontend WebSocket errors before replay completes',
      () =>
        Effect.gen(function* () {
          let connectionCount = 0;
          const firstCloseMock = vi.fn();
          const secondCloseMock = vi.fn();
          const WebSocketMock = vi.fn(function (
            this: {
              addEventListener(
                type: string,
                listener: (event: { data: unknown }) => void,
              ): void;
              close(): void;
              send(message: string): void;
            },
            _url: string,
          ) {
            connectionCount += 1;
            const currentConnection = connectionCount;
            let closeListener: ((event: { data: unknown }) => void) | undefined;
            let messageListener:
              | ((event: { data: unknown }) => void)
              | undefined;

            this.addEventListener = (type, listener) => {
              if (type === 'message') {
                messageListener = listener;
              }
              if (type === 'close') {
                closeListener = listener;
              }
              if (currentConnection === 1 && type === 'error') {
                queueMicrotask(() => listener({ data: undefined }));
              }
              if (currentConnection === 2 && type === 'open') {
                queueMicrotask(() => listener({ data: undefined }));
              }
            };
            this.close =
              currentConnection === 1
                ? firstCloseMock.mockImplementation(() => {
                    queueMicrotask(() => closeListener?.({ data: undefined }));
                  })
                : secondCloseMock;
            this.send = () => {
              queueMicrotask(() => {
                messageListener?.({
                  data: JSON.stringify({
                    type: 'replay-complete',
                    generationId: frontendState.generationId,
                    frontendIndex: frontendState.frontendIndex,
                  }),
                });
              });
            };
          });
          Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { WebSocket: WebSocketMock },
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserPartitionController: makeBrowserPartitionController({
              partitionKey: 'partition_1',
              getFrontendAuthenticator: () => ({
                frontend: { kind: 'account', frontend },
                generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
              }),
            }),
          });

          expect(WebSocketMock).toHaveBeenCalledTimes(2);
          expect(firstCloseMock).toHaveBeenCalledTimes(1);
          expect(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledTimes(2);
          yield* bootstrapResult.releaseBrowserSession;
          expect(secondCloseMock).toHaveBeenCalledTimes(1);
        }),
      15_000,
    );

    it.effect(
      'reconnects when the frontend WebSocket closes before replay completes',
      () =>
        Effect.gen(function* () {
          let connectionCount = 0;
          const secondCloseMock = vi.fn();
          const WebSocketMock = vi.fn(function (
            this: {
              addEventListener(
                type: string,
                listener: (event: { data: unknown }) => void,
              ): void;
              close(): void;
              send(message: string): void;
            },
            _url: string,
          ) {
            connectionCount += 1;
            const currentConnection = connectionCount;
            let messageListener:
              | ((event: { data: unknown }) => void)
              | undefined;

            this.addEventListener = (type, listener) => {
              if (type === 'message') {
                messageListener = listener;
              }
              if (currentConnection === 1 && type === 'close') {
                queueMicrotask(() => listener({ data: undefined }));
              }
              if (currentConnection === 2 && type === 'open') {
                queueMicrotask(() => listener({ data: undefined }));
              }
            };
            this.close = secondCloseMock;
            this.send = () => {
              queueMicrotask(() => {
                messageListener?.({
                  data: JSON.stringify({
                    type: 'replay-complete',
                    generationId: frontendState.generationId,
                    frontendIndex: frontendState.frontendIndex,
                  }),
                });
              });
            };
          });
          Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { WebSocket: WebSocketMock },
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserPartitionController: makeBrowserPartitionController({
              partitionKey: 'partition_1',
              getFrontendAuthenticator: () => ({
                frontend: { kind: 'account', frontend },
                generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
              }),
            }),
          });

          expect(WebSocketMock).toHaveBeenCalledTimes(2);
          expect(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledTimes(2);
          yield* bootstrapResult.releaseBrowserSession;
          expect(secondCloseMock).toHaveBeenCalledTimes(1);
        }),
      15_000,
    );

    it.effect(
      'opens the browser WebSocket with the expected URL and closes it on release',
      () =>
        Effect.gen(function* () {
          let messageListener: ((event: { data: unknown }) => void) | undefined;
          const closeMock = vi.fn();
          const sendMock = vi.fn(() => {
            queueMicrotask(() => {
              messageListener?.({
                data: JSON.stringify({
                  type: 'replay-complete',
                  generationId: frontendState.generationId,
                  frontendIndex: frontendState.frontendIndex,
                }),
              });
            });
          });
          const addEventListenerMock = vi.fn<
            (type: string, listener: (event: { data: unknown }) => void) => void
          >((type, listener) => {
            if (type === 'message') {
              messageListener = listener;
            }
            if (type === 'open') {
              queueMicrotask(() => listener({ data: undefined }));
            }
          });
          const WebSocketMock = vi.fn(function (
            this: {
              addEventListener: typeof addEventListenerMock;
              close: typeof closeMock;
              send: typeof sendMock;
            },
            _url: string,
          ) {
            this.addEventListener = addEventListenerMock;
            this.close = closeMock;
            this.send = sendMock;
          });
          Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
              WebSocket: WebSocketMock,
            },
          });

          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeSession({
            frontend,
            generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
            sessionId,
          });

          const bootstrapResult = yield* bootstrapBrowserSession({
            session,
            browserPartitionController: makeBrowserPartitionController({
              partitionKey: 'partition_1',
              getFrontendAuthenticator: () => ({
                frontend: { kind: 'account', frontend },
                generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
              }),
            }),
          });

          const frontendWebSocketUrl = new URL(
            String(WebSocketMock.mock.calls[0]?.[0]),
          );

          expect(WebSocketMock).toHaveBeenCalledTimes(1);
          expect(frontendWebSocketUrl.protocol).toBe('wss:');
          expect(frontendWebSocketUrl.pathname).toBe('/ws-frontend-blocks');
          expect(frontendWebSocketUrl.searchParams.get('publishableKey')).toBe(
            'pk_test',
          );
          expect(frontendWebSocketUrl.searchParams.get('ticket')).toBe(
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          );
          expect(Array.from(frontendWebSocketUrl.searchParams.keys())).toEqual([
            'publishableKey',
            'ticket',
          ]);
          expect(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledTimes(1);
          expect(sendMock).toHaveBeenCalledWith(
            JSON.stringify({
              replicaGenerationId: frontendState.generationId,
              frontendIndex: frontendState.frontendIndex,
            }),
          );
          expect(addEventListenerMock).toHaveBeenCalledWith(
            'message',
            expect.any(Function),
          );
          if (messageListener === undefined) {
            throw new Error('Expected frontend websocket message listener');
          }
          const frontendBlockMessage = JSON.stringify({
            type: 'frontendBlock',
            sync: {
              kind: 'frontend',
              systemId: frontendState.systemId,
              generationId: frontendState.generationId,
              accountId: frontendState.accountId,
              accountName: frontendState.accountName,
              actorId: frontendState.actorId,
              actorName: frontendState.actorName,
              frontendName: frontend.frontendName,
              frontendBlock: {
                frontendName: frontend.frontendName,
                lastAccountCursor: 'acur_1',
                frontendIndex: 1,
                lastRebasedPushedCursor: null,
                delta: {
                  inserted: [],
                  updated: [],
                  deleted: [],
                },
                pendingPushedCommands: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
              },
            },
          });
          messageListener({ data: frontendBlockMessage });
          yield* Effect.promise(
            () => new Promise<void>(resolve => queueMicrotask(resolve)),
          );
          yield* Effect.promise(
            () => new Promise<void>(resolve => queueMicrotask(resolve)),
          );
          expect(session.store.getState().frontendIndex).toBe(1);
          expect(
            getInitializedStateOrThrow({ session }).lastRebasedPushedCursor,
          ).toBe(null);

          yield* bootstrapResult.releaseBrowserSession;

          expect(closeMock).toHaveBeenCalledTimes(1);
        }),
    );
  });
});
