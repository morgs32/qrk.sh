import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { Effect, Either, Layer, Redacted, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { beforeEach, describe, expect, vi } from 'vitest';

import { bootstrapBrowserServiceSession } from './bootstrapBrowserServiceSession';
import { makeBrowserPartitionController } from './makeBrowserPartitionController';

const fetchServiceFrontendMock = vi.hoisted(() => vi.fn());
const fetchServiceFrontendStateMock = vi.hoisted(() => vi.fn());
const acquireServiceFrontendWebSocketMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/frontend/fetchServiceFrontend', () => ({
  fetchServiceFrontend: fetchServiceFrontendMock,
}));

vi.mock('@zerospin/frontend/fetchServiceFrontendState', () => ({
  fetchServiceFrontendState: fetchServiceFrontendStateMock,
}));

vi.mock('./acquireServiceFrontendWebSocket', () => ({
  acquireServiceFrontendWebSocket: acquireServiceFrontendWebSocketMock,
}));

const frontend = makeServiceFrontendController({
  systemName: 'service-bootstrap-system',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog-web',
  version: '1.0.0',
  models: {},
  signature: Schema.Struct({ viewerId: Schema.String }),
});

const frontendV2 = makeServiceFrontendController({
  systemName: frontend.systemName,
  serviceName: frontend.serviceName,
  actorName: frontend.actorName,
  frontendName: frontend.frontendName,
  version: '2.0.0',
  models: {},
  signature: Schema.Struct({ viewerId: Schema.String }),
});

const identity = {
  actorId: 'actr_service_bootstrap',
  systemId: 'sys_service_bootstrap',
  generationId: 'gen_service_bootstrap',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker-service-bootstrap',
  serviceName: frontend.serviceName,
  actorName: frontend.actorName,
  frontendName: frontend.frontendName,
  frontendVersion: frontend.version,
};

const frontendState = {
  actorId: identity.actorId,
  systemId: identity.systemId,
  generationId: identity.generationId,
  systemVersion: identity.systemVersion,
  systemWorkerName: identity.systemWorkerName,
  serviceName: identity.serviceName,
  actorName: identity.actorName,
  frontendName: identity.frontendName,
  frontendIndex: 0,
  resources: [],
};

const telemetryCollector = makeTelemetryCollector();
const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('bootstrapBrowserServiceSession'),
  Layer.succeed(ZerospinApisUrl, 'https://api.example.com/'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  AsyncLive,
  makeTelemetryLayer(telemetryCollector),
  TestContext,
);

describe('bootstrapBrowserServiceSession', () => {
  beforeEach(() => {
    telemetryCollector.flush();
    fetchServiceFrontendMock.mockReset();
    fetchServiceFrontendStateMock.mockReset();
    acquireServiceFrontendWebSocketMock.mockReset();
    fetchServiceFrontendMock.mockReturnValue(
      Effect.succeed({
        identity,
        frontendSpec: makeServiceFrontendControllerSpec(frontend),
        frontendApi: mockFrontendApi,
        releaseFrontendApi: vi.fn(),
      }),
    );
    fetchServiceFrontendStateMock.mockReturnValue(
      Effect.succeed(frontendState),
    );
    acquireServiceFrontendWebSocketMock.mockReturnValue(
      Effect.succeed(Effect.void),
    );
    vi.mocked(mockFrontendApi.createFrontendWebSocketTicket).mockReset();
    vi.mocked(mockFrontendApi.createFrontendWebSocketTicket).mockResolvedValue({
      result: encodeRight({
        ticket: 'service_frontend_ticket',
        systemId: identity.systemId,
        generationId: identity.generationId,
        serviceName: identity.serviceName,
        actorId: identity.actorId,
        actorName: identity.actorName,
        frontendName: identity.frontendName,
        frontendVersion: identity.frontendVersion,
      }),
      link: null,
    });
  });

  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates and releases a distinct capability for every shared-worker service provider call',
      () =>
        Effect.gen(function* () {
          const releaseBootstrapFrontendApi = vi.fn();
          const releaseStateFrontendApi = vi.fn();
          const releaseTicketFrontendApi = vi.fn();
          const releaseOperationalStateFrontendApi = vi.fn();
          const generateSignature = vi.fn(() =>
            Effect.succeed({ viewerId: 'viewer_1' }),
          );
          const bootstrapFrontendApi = { ...mockFrontendApi };
          const stateFrontendApi = { ...mockFrontendApi };
          const ticketFrontendApi = { ...mockFrontendApi };
          fetchServiceFrontendMock
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: bootstrapFrontendApi,
                  releaseFrontendApi: releaseBootstrapFrontendApi,
                };
              }),
            )
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: stateFrontendApi,
                  releaseFrontendApi: releaseStateFrontendApi,
                };
              }),
            )
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: ticketFrontendApi,
                  releaseFrontendApi: releaseTicketFrontendApi,
                };
              }),
            )
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: stateFrontendApi,
                  releaseFrontendApi: releaseOperationalStateFrontendApi,
                };
              }),
            );
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_fresh_service_capabilities',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature,
            }),
          });
          const acquireServiceFrontendReplica = vi
            .spyOn(
              browserPartitionController,
              'acquireServiceFrontendReplica',
            )
            .mockImplementation(() =>
              Effect.succeed({
                hydrateSession: hydrateProps =>
                  Effect.promise(async () => {
                    const serviceFrontendReplicaState = {
                      ...frontendState,
                      frontendVersion: frontend.version,
                      replicaIndex: 0,
                    };
                    await hydrateProps.replaceFrontendState(
                      serviceFrontendReplicaState,
                    );
                    hydrateProps.setDatabaseName(
                      'fresh-service-capabilities.sqlite3',
                    );
                    return {
                      serviceFrontendReplicaState,
                      databaseName: 'fresh-service-capabilities.sqlite3',
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
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'shared-worker',
          });

          const bootstrapResult = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          });
          const network =
            acquireServiceFrontendReplica.mock.calls[0]?.[0].network;
          if (network === null || network === undefined) {
            throw new Error(
              'Expected the shared-worker service acquisition to receive a network provider',
            );
          }

          yield* Effect.promise(() => network.getFrontendState());
          yield* Effect.promise(() =>
            network.createFrontendWebSocketTicket(),
          );
          fetchServiceFrontendStateMock.mockReturnValueOnce(
            Effect.fail(
              new ZerospinError({
                code: 'service-frontend-state-required',
                message:
                  'Worker requested ordinary service state repair for an operational gap',
              }),
            ),
          );
          yield* Effect.promise(() => network.getFrontendState());

          expect(generateSignature).toHaveBeenCalledTimes(4);
          expect(fetchServiceFrontendMock).toHaveBeenCalledTimes(4);
          expect(releaseBootstrapFrontendApi).toHaveBeenCalledTimes(1);
          expect(releaseStateFrontendApi).toHaveBeenCalledTimes(1);
          expect(releaseTicketFrontendApi).toHaveBeenCalledTimes(1);
          expect(releaseOperationalStateFrontendApi).toHaveBeenCalledTimes(1);
          expect(fetchServiceFrontendStateMock).toHaveBeenCalledWith({
            frontendApi: stateFrontendApi,
          });
          expect(
            ticketFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledTimes(1);
          expect(invalidateCachedLocators).not.toHaveBeenCalled();

          yield* bootstrapResult.releaseBrowserSession;
        }),
    );

    it.effect(
      'hands an online service generation successor to a second active acquisition with fresh network capabilities',
      () =>
        Effect.gen(function* () {
          const releaseInitialFrontendApi = vi.fn();
          const releaseRegainedFrontendApi = vi.fn();
          const releaseStateFrontendApi = vi.fn();
          const releaseTicketFrontendApi = vi.fn();
          const initialFrontendApi = { ...mockFrontendApi };
          const regainedFrontendApi = { ...mockFrontendApi };
          const stateFrontendApi = { ...mockFrontendApi };
          const ticketFrontendApi = { ...mockFrontendApi };
          const successorIdentity = {
            ...identity,
            generationId: 'gen_service_successor_online',
            systemVersion: '2.0.0',
            systemWorkerName: 'worker-service-successor-online',
          };
          const generateSignature = vi.fn(() =>
            Effect.succeed({ viewerId: 'viewer_1' }),
          );
          fetchServiceFrontendMock
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: initialFrontendApi,
                  releaseFrontendApi: releaseInitialFrontendApi,
                };
              }),
            )
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity: successorIdentity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: regainedFrontendApi,
                  releaseFrontendApi: releaseRegainedFrontendApi,
                };
              }),
            )
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity: successorIdentity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: stateFrontendApi,
                  releaseFrontendApi: releaseStateFrontendApi,
                };
              }),
            )
            .mockImplementationOnce(fetchProps =>
              Effect.gen(function* () {
                yield* fetchProps.generateSignature();
                return {
                  identity: successorIdentity,
                  frontendSpec: makeServiceFrontendControllerSpec(frontend),
                  frontendApi: ticketFrontendApi,
                  releaseFrontendApi: releaseTicketFrontendApi,
                };
              }),
            );
          fetchServiceFrontendStateMock.mockReturnValue(
            Effect.succeed({
              ...frontendState,
              generationId: successorIdentity.generationId,
              systemVersion: successorIdentity.systemVersion,
              systemWorkerName: successorIdentity.systemWorkerName,
            }),
          );
          vi.mocked(
            mockFrontendApi.createFrontendWebSocketTicket,
          ).mockResolvedValue({
            result: encodeRight({
              ticket: 'service_frontend_successor_ticket',
              systemId: successorIdentity.systemId,
              generationId: successorIdentity.generationId,
              serviceName: successorIdentity.serviceName,
              actorId: successorIdentity.actorId,
              actorName: successorIdentity.actorName,
              frontendName: successorIdentity.frontendName,
              frontendVersion: successorIdentity.frontendVersion,
            }),
            link: null,
          });
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_online_service_successor',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature,
            }),
          });
          const acquireServiceFrontendReplica = vi
            .spyOn(
              browserPartitionController,
              'acquireServiceFrontendReplica',
            )
            .mockImplementation(() =>
              Effect.succeed({
                hydrateSession: hydrateProps =>
                  Effect.promise(async () => {
                    const serviceFrontendReplicaState = {
                      ...frontendState,
                      frontendVersion: frontend.version,
                      replicaIndex: 0,
                    };
                    await hydrateProps.replaceFrontendState(
                      serviceFrontendReplicaState,
                    );
                    hydrateProps.setDatabaseName(
                      'online-service-successor.sqlite3',
                    );
                    return {
                      serviceFrontendReplicaState,
                      databaseName: 'online-service-successor.sqlite3',
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
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'shared-worker',
          });

          const bootstrapResult = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          });
          const initialAcquisitionProps =
            acquireServiceFrontendReplica.mock.calls[0]?.[0];
          if (
            initialAcquisitionProps === undefined ||
            initialAcquisitionProps.transportRegain === null
          ) {
            throw new Error(
              'Expected the online service acquisition to retain a transport-regain callback',
            );
          }

          yield* Effect.promise(() =>
            initialAcquisitionProps.transportRegain(),
          );

          expect(acquireServiceFrontendReplica).toHaveBeenCalledTimes(2);
          const successorAcquisitionProps =
            acquireServiceFrontendReplica.mock.calls[1]?.[0];
          expect(successorAcquisitionProps).toMatchObject({
            generationId: successorIdentity.generationId,
            systemVersion: successorIdentity.systemVersion,
            authority: 'online',
            role: 'active',
            transportRegain: null,
          });
          if (
            successorAcquisitionProps === undefined ||
            successorAcquisitionProps.network === null
          ) {
            throw new Error(
              'Expected the service successor acquisition to receive a network provider',
            );
          }

          yield* Effect.promise(() =>
            successorAcquisitionProps.network.getFrontendState(),
          );
          yield* Effect.promise(() =>
            successorAcquisitionProps.network.createFrontendWebSocketTicket(),
          );

          expect(generateSignature).toHaveBeenCalledTimes(4);
          expect(fetchServiceFrontendMock).toHaveBeenCalledTimes(4);
          expect(releaseInitialFrontendApi).toHaveBeenCalledOnce();
          expect(releaseRegainedFrontendApi).toHaveBeenCalledOnce();
          expect(releaseStateFrontendApi).toHaveBeenCalledOnce();
          expect(releaseTicketFrontendApi).toHaveBeenCalledOnce();
          expect(fetchServiceFrontendStateMock).toHaveBeenCalledWith({
            frontendApi: stateFrontendApi,
          });
          expect(
            ticketFrontendApi.createFrontendWebSocketTicket,
          ).toHaveBeenCalledOnce();
          expect(invalidateCachedLocators).not.toHaveBeenCalled();

          yield* bootstrapResult.releaseBrowserSession;
        }),
    );

    it.effect(
      'keeps direct mode locator-free and closes its Provider database after socket release',
      () =>
        Effect.gen(function* () {
          const releaseSocket = vi.fn();
          acquireServiceFrontendWebSocketMock.mockReturnValueOnce(
            Effect.succeed(Effect.sync(releaseSocket)),
          );
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_direct_service',
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature: () => Effect.succeed({ viewerId: 'viewer_1' }),
            }),
          });
          const setCachedLocator = vi.spyOn(
            browserPartitionController,
            'setCachedServiceFrontendLocator',
          );
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'direct',
          });

          const bootstrapResult = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          });
          const initialized = session.store.getState();
          if (!initialized.isInitialized) {
            throw new Error('Expected initialized direct service session');
          }
          const closeDatabase = vi.spyOn(
            initialized.db.$client.sqlite3,
            'close',
          );

          expect(setCachedLocator).not.toHaveBeenCalled();
          expect(invalidateCachedLocators).not.toHaveBeenCalled();
          yield* bootstrapResult.releaseBrowserSession;
          expect(releaseSocket).toHaveBeenCalledOnce();
          expect(closeDatabase).toHaveBeenCalledWith(initialized.db.$client.db);
        }),
    );

    it.effect(
      'invalidates every direct-mode service locator after local signature rejection',
      () =>
        Effect.gen(function* () {
          fetchServiceFrontendMock.mockReturnValueOnce(
            Effect.fail(
              new ZerospinError({
                code: 'service-frontend-local-signature-invalid',
                message: 'Service signature did not match the local schema',
              }),
            ),
          );
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_service_revocation',
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature: () => Effect.succeed({ viewerId: 'viewer_1' }),
            }),
          });
          browserPartitionController.setCachedServiceFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
            identity: {
              systemName: frontend.systemName,
              serviceName: identity.serviceName,
              actorName: identity.actorName,
              actorId: identity.actorId,
              frontendName: identity.frontendName,
              frontendVersion: identity.frontendVersion,
              systemId: identity.systemId,
              generationId: identity.generationId,
              systemVersion: identity.systemVersion,
              systemWorkerName: identity.systemWorkerName,
            },
          });
          browserPartitionController.setCachedServiceFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend: frontendV2,
            role: 'commissioned',
            identity: {
              systemName: frontendV2.systemName,
              serviceName: frontendV2.serviceName,
              actorName: frontendV2.actorName,
              actorId: identity.actorId,
              frontendName: frontendV2.frontendName,
              frontendVersion: frontendV2.version,
              systemId: identity.systemId,
              generationId: 'gen_service_bootstrap_v2',
              systemVersion: '2.0.0',
              systemWorkerName: 'worker-service-bootstrap-v2',
            },
          });
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'direct',
          });

          const result = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          expect(invalidateCachedLocators).toHaveBeenCalledOnce();
          expect(
            browserPartitionController.getCachedServiceFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend,
              role: 'active',
            }),
          ).toBeNull();
          expect(
            browserPartitionController.getCachedServiceFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend: frontendV2,
              role: 'commissioned',
            }),
          ).toBeNull();
        }),
    );

    it.effect(
      'preserves every cached service locator when admission finds only a same-principal frontend version change',
      () =>
        Effect.gen(function* () {
          fetchServiceFrontendMock.mockReturnValueOnce(
            Effect.fail(
              new ZerospinError({
                code: 'service-frontend-admission-target-mismatch',
                message:
                  'Authenticated service frontend admission does not match compiled code',
                extra: {
                  expectedServiceName: frontend.serviceName,
                  serviceName: frontend.serviceName,
                  expectedActorName: frontend.actorName,
                  actorName: frontend.actorName,
                  expectedFrontendName: frontend.frontendName,
                  frontendName: frontend.frontendName,
                  expectedFrontendVersion: frontend.version,
                  frontendVersion: frontendV2.version,
                },
              }),
            ),
          );
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_service_version_change',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature: () => Effect.succeed({ viewerId: 'viewer_1' }),
            }),
          });
          browserPartitionController.setCachedServiceFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
            identity: {
              systemName: frontend.systemName,
              serviceName: identity.serviceName,
              actorName: identity.actorName,
              actorId: identity.actorId,
              frontendName: identity.frontendName,
              frontendVersion: identity.frontendVersion,
              systemId: identity.systemId,
              generationId: identity.generationId,
              systemVersion: identity.systemVersion,
              systemWorkerName: identity.systemWorkerName,
            },
          });
          browserPartitionController.setCachedServiceFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend: frontendV2,
            role: 'commissioned',
            identity: {
              systemName: frontendV2.systemName,
              serviceName: frontendV2.serviceName,
              actorName: frontendV2.actorName,
              actorId: identity.actorId,
              frontendName: frontendV2.frontendName,
              frontendVersion: frontendV2.version,
              systemId: identity.systemId,
              generationId: 'gen_service_bootstrap_v2',
              systemVersion: '2.0.0',
              systemWorkerName: 'worker-service-bootstrap-v2',
            },
          });
          const invalidateCachedLocators = vi.spyOn(
            browserPartitionController,
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'shared-worker',
          });

          const result = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left.code).toBe(
              'service-frontend-admission-target-mismatch',
            );
          }
          expect(invalidateCachedLocators).not.toHaveBeenCalled();
          expect(
            browserPartitionController.getCachedServiceFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend,
              role: 'active',
            }),
          ).not.toBeNull();
          expect(
            browserPartitionController.getCachedServiceFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend: frontendV2,
              role: 'commissioned',
            }),
          ).not.toBeNull();
        }),
    );

    it.effect(
      'hands a matching generation successor to the cached service replica without discarding its source locator',
      () =>
        Effect.gen(function* () {
          const releaseRegainedFrontendApi = vi.fn();
          fetchServiceFrontendMock
            .mockReturnValueOnce(
              Effect.fail(
                new ZerospinError({
                  code: 'service-frontend-admission-transport-failed',
                  message: 'Service transport is temporarily unavailable',
                }),
              ),
            )
            .mockReturnValueOnce(
              Effect.succeed({
                identity: {
                  ...identity,
                  generationId: 'gen_service_successor',
                  systemVersion: '2.0.0',
                  systemWorkerName: 'worker-service-successor',
                },
                frontendSpec: makeServiceFrontendControllerSpec(frontend),
                frontendApi: mockFrontendApi,
                releaseFrontendApi: releaseRegainedFrontendApi,
              }),
            );
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_service_generation_successor',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature: () => Effect.succeed({ viewerId: 'viewer_1' }),
            }),
          });
          browserPartitionController.setCachedServiceFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
            identity: {
              systemName: frontend.systemName,
              serviceName: identity.serviceName,
              actorName: identity.actorName,
              actorId: identity.actorId,
              frontendName: identity.frontendName,
              frontendVersion: identity.frontendVersion,
              systemId: identity.systemId,
              generationId: identity.generationId,
              systemVersion: identity.systemVersion,
              systemWorkerName: identity.systemWorkerName,
            },
          });
          const acquireServiceFrontendReplica = vi
            .spyOn(browserPartitionController, 'acquireServiceFrontendReplica')
            .mockImplementation(() =>
              Effect.succeed({
                hydrateSession: hydrateProps =>
                  Effect.promise(async () => {
                    const serviceFrontendReplicaState = {
                      ...frontendState,
                      frontendVersion: frontend.version,
                      replicaIndex: 1,
                    };
                    await hydrateProps.replaceFrontendState(
                      serviceFrontendReplicaState,
                    );
                    hydrateProps.setDatabaseName('cached-service-source.db');
                    return {
                      serviceFrontendReplicaState,
                      databaseName: 'cached-service-source.db',
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
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'shared-worker',
          });

          const bootstrapResult = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          });
          const cachedAcquisitionProps =
            acquireServiceFrontendReplica.mock.calls[0]?.[0];
          if (
            cachedAcquisitionProps === undefined ||
            cachedAcquisitionProps.transportRegain === null
          ) {
            throw new Error(
              'Expected cached service acquisition to retain a transport-regain callback',
            );
          }

          yield* Effect.promise(() => cachedAcquisitionProps.transportRegain());

          expect(acquireServiceFrontendReplica).toHaveBeenCalledTimes(2);
          expect(
            acquireServiceFrontendReplica.mock.calls[1]?.[0],
          ).toMatchObject({
            generationId: 'gen_service_successor',
            systemVersion: '2.0.0',
            authority: 'online',
          });
          expect(invalidateCachedLocators).not.toHaveBeenCalled();
          expect(
            browserPartitionController.getCachedServiceFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend,
              role: 'active',
            }),
          ).toMatchObject({
            generationId: identity.generationId,
            systemVersion: identity.systemVersion,
            systemWorkerName: identity.systemWorkerName,
          });
          expect(releaseRegainedFrontendApi).toHaveBeenCalledTimes(1);

          yield* bootstrapResult.releaseBrowserSession;
          yield* Effect.promise(() => browserPartitionController.release());
        }),
    );

    it.effect(
      'retains the cached service source when regained frontend code is incompatible',
      () =>
        Effect.gen(function* () {
          const releaseRegainedFrontendApi = vi.fn();
          fetchServiceFrontendMock
            .mockReturnValueOnce(
              Effect.fail(
                new ZerospinError({
                  code: 'service-frontend-admission-transport-failed',
                  message: 'Service transport is temporarily unavailable',
                }),
              ),
            )
            .mockReturnValueOnce(
              Effect.succeed({
                identity: {
                  ...identity,
                  generationId: 'gen_service_incompatible',
                  systemVersion: '2.0.0',
                  systemWorkerName: 'worker-service-incompatible',
                  frontendVersion: '2.0.0',
                },
                frontendSpec: makeServiceFrontendControllerSpec(frontend),
                frontendApi: mockFrontendApi,
                releaseFrontendApi: releaseRegainedFrontendApi,
              }),
            );
          const browserPartitionController = makeBrowserPartitionController({
            partitionKey: 'partition_service_incompatible_regain',
            isSharedWorkerEnabled: true,
            getFrontendAuthenticator: () => ({
              frontend: { kind: 'service', frontend },
              generateSignature: () => Effect.succeed({ viewerId: 'viewer_1' }),
            }),
          });
          browserPartitionController.setCachedServiceFrontendLocator({
            apiUrl: 'https://api.example.com/',
            publishableKey: 'pk_test',
            frontend,
            role: 'active',
            identity: {
              systemName: frontend.systemName,
              serviceName: identity.serviceName,
              actorName: identity.actorName,
              actorId: identity.actorId,
              frontendName: identity.frontendName,
              frontendVersion: identity.frontendVersion,
              systemId: identity.systemId,
              generationId: identity.generationId,
              systemVersion: identity.systemVersion,
              systemWorkerName: identity.systemWorkerName,
            },
          });
          const acquireServiceFrontendReplica = vi
            .spyOn(browserPartitionController, 'acquireServiceFrontendReplica')
            .mockImplementation(() =>
              Effect.succeed({
                hydrateSession: hydrateProps =>
                  Effect.promise(async () => {
                    const serviceFrontendReplicaState = {
                      ...frontendState,
                      frontendVersion: frontend.version,
                      replicaIndex: 1,
                    };
                    await hydrateProps.replaceFrontendState(
                      serviceFrontendReplicaState,
                    );
                    hydrateProps.setDatabaseName('cached-service-source.db');
                    return {
                      serviceFrontendReplicaState,
                      databaseName: 'cached-service-source.db',
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
            'invalidateCachedServiceFrontendLocators',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          const session = makeServiceSession({
            frontend,
            sessionId,
            mode: 'shared-worker',
          });

          const bootstrapResult = yield* bootstrapBrowserServiceSession({
            session,
            browserPartitionController,
          });
          const cachedAcquisitionProps =
            acquireServiceFrontendReplica.mock.calls[0]?.[0];
          if (
            cachedAcquisitionProps === undefined ||
            cachedAcquisitionProps.transportRegain === null
          ) {
            throw new Error(
              'Expected cached service acquisition to retain a transport-regain callback',
            );
          }

          yield* Effect.promise(() => cachedAcquisitionProps.transportRegain());

          expect(acquireServiceFrontendReplica).toHaveBeenCalledOnce();
          expect(releaseRegainedFrontendApi).toHaveBeenCalledOnce();
          expect(invalidateCachedLocators).not.toHaveBeenCalled();
          expect(
            browserPartitionController.getCachedServiceFrontendLocator({
              apiUrl: 'https://api.example.com/',
              publishableKey: 'pk_test',
              frontend,
              role: 'active',
            }),
          ).toMatchObject({
            generationId: identity.generationId,
            frontendVersion: identity.frontendVersion,
          });

          yield* bootstrapResult.releaseBrowserSession;
          yield* Effect.promise(() => browserPartitionController.release());
        }),
    );
  });
});
