import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { mockFrontendApi } from '@zerospin/core/session/test-utils/mockFrontendApi';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import {
  Effect,
  Either,
  Layer,
  ManagedRuntime,
  Redacted,
  Schema,
} from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  BrowserPartitionControllerContext,
  makeBrowserPartitionController,
} from './makeBrowserPartitionController';
import { useCommissionFrontendReplica } from './useCommissionFrontendReplica';

const fetchFrontendMock = vi.hoisted(() => vi.fn());
const fetchServiceFrontendMock = vi.hoisted(() => vi.fn());
const makeSharedWorkerSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@zerospin/frontend/fetchFrontend', () => ({
  fetchFrontend: fetchFrontendMock,
}));

vi.mock('@zerospin/frontend/fetchServiceFrontend', () => ({
  fetchServiceFrontend: fetchServiceFrontendMock,
}));

vi.mock('@zerospin/shared-worker/makeSharedWorkerSession', () => ({
  makeSharedWorkerSession: makeSharedWorkerSessionMock,
}));

const frontend = makeFrontendController({
  systemName: 'commission-hook-system',
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '2.0.0',
  models: {},
  contracts: {},
  signature: Schema.Struct({ userId: Schema.String }),
});

const serviceFrontend = makeServiceFrontendController({
  systemName: 'commission-hook-system',
  serviceName: 'catalog',
  actorName: 'viewer',
  frontendName: 'catalog-web',
  version: '2.0.0',
  models: {},
  signature: Schema.Struct({ viewerId: Schema.String }),
});

const sessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
    Layer.succeed(ZerospinApisUrl, 'https://api.example.test'),
  ),
);

let container: HTMLDivElement;
let root: Root;
let storageValues: Map<string, string>;

beforeEach(() => {
  fetchFrontendMock.mockReset();
  fetchServiceFrontendMock.mockReset();
  makeSharedWorkerSessionMock.mockReset();
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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await sessionRuntime.dispose();
});

describe('useCommissionFrontendReplica', () => {
  it('returns the explicit direct-mode commissioning failure without authenticating', async () => {
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-direct',
      isSharedWorkerEnabled: false,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'account', frontend },
        generateSignature: () => Effect.succeed({ userId: 'user-1' }),
      }),
    });
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Commission hook did not render');
    }
    const result = await actions.commission();

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        code: 'frontend-commissioning-unavailable-in-direct-mode',
      });
    }
    expect(fetchFrontendMock).not.toHaveBeenCalled();
  });

  it('invalidates account locators when commissioning rejects a local signature', async () => {
    const signatureFailure = new ZerospinError({
      code: 'frontend-commission-signature-invalid',
      message: 'The account signature did not match the local schema',
    });
    fetchFrontendMock.mockReturnValue(Effect.fail(signatureFailure));
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-account-signature-invalid',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'account', frontend },
        generateSignature: () => Effect.succeed({ userId: 'user-1' }),
      }),
    });
    const invalidateCachedLocators = vi.spyOn(
      controller,
      'invalidateCachedAccountFrontendLocators',
    );
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Account commission hook did not render');
    }
    const result = await actions.commission();

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBe(signatureFailure);
    }
    expect(invalidateCachedLocators).toHaveBeenCalledOnce();
    expect(makeSharedWorkerSessionMock).not.toHaveBeenCalled();
  });

  it('invalidates service locators when commissioning rejects a local signature', async () => {
    const signatureFailure = new ZerospinError({
      code: 'service-frontend-commission-signature-invalid',
      message: 'The service signature did not match the local schema',
    });
    fetchServiceFrontendMock.mockReturnValue(Effect.fail(signatureFailure));
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-service-signature-invalid',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'service', frontend: serviceFrontend },
        generateSignature: () => Effect.succeed({ viewerId: 'viewer-1' }),
      }),
    });
    const invalidateCachedLocators = vi.spyOn(
      controller,
      'invalidateCachedServiceFrontendLocators',
    );
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'service',
        frontend: serviceFrontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Service commission hook did not render');
    }
    const result = await actions.commission();

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBe(signatureFailure);
    }
    expect(invalidateCachedLocators).toHaveBeenCalledOnce();
    expect(makeSharedWorkerSessionMock).not.toHaveBeenCalled();
  });

  it('reports a same-target account admission version mismatch as a non-routable candidate', async () => {
    const mismatchExtra = {
      expectedAccountName: frontend.accountName,
      accountName: frontend.accountName,
      expectedActorName: frontend.actorName,
      actorName: frontend.actorName,
      expectedFrontendName: frontend.frontendName,
      frontendName: frontend.frontendName,
      expectedFrontendVersion: frontend.version,
      frontendVersion: '1.0.0',
    };
    fetchFrontendMock.mockReturnValue(
      Effect.fail(
        new ZerospinError({
          code: 'frontend-admission-target-mismatch',
          message:
            'Authenticated account frontend admission does not match the compiled controller',
          extra: mismatchExtra,
        }),
      ),
    );
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-account-version-mismatch',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'account', frontend },
        generateSignature: () => Effect.succeed({ userId: 'user-1' }),
      }),
    });
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Account commission hook did not render');
    }
    const result = await actions.commission();

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        code: 'frontend-version-changed',
        extra: mismatchExtra,
      });
    }
    expect(makeSharedWorkerSessionMock).not.toHaveBeenCalled();
  });

  it('preserves an account admission mismatch when a static target name changed', async () => {
    fetchFrontendMock.mockReturnValue(
      Effect.fail(
        new ZerospinError({
          code: 'frontend-admission-target-mismatch',
          message:
            'Authenticated account frontend admission does not match the compiled controller',
          extra: {
            expectedAccountName: frontend.accountName,
            accountName: frontend.accountName,
            expectedActorName: frontend.actorName,
            actorName: 'another-actor',
            expectedFrontendName: frontend.frontendName,
            frontendName: frontend.frontendName,
            expectedFrontendVersion: frontend.version,
            frontendVersion: '1.0.0',
          },
        }),
      ),
    );
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-account-target-mismatch',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'account', frontend },
        generateSignature: () => Effect.succeed({ userId: 'user-1' }),
      }),
    });
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Account commission hook did not render');
    }
    const result = await actions.commission();

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        code: 'frontend-admission-target-mismatch',
      });
    }
    expect(makeSharedWorkerSessionMock).not.toHaveBeenCalled();
  });

  it('reports a same-target service admission version mismatch as a non-routable candidate', async () => {
    const mismatchExtra = {
      expectedServiceName: serviceFrontend.serviceName,
      serviceName: serviceFrontend.serviceName,
      expectedActorName: serviceFrontend.actorName,
      actorName: serviceFrontend.actorName,
      expectedFrontendName: serviceFrontend.frontendName,
      frontendName: serviceFrontend.frontendName,
      expectedFrontendVersion: serviceFrontend.version,
      frontendVersion: '1.0.0',
    };
    fetchServiceFrontendMock.mockReturnValue(
      Effect.fail(
        new ZerospinError({
          code: 'service-frontend-admission-target-mismatch',
          message:
            'Authenticated service frontend admission does not match the compiled controller',
          extra: mismatchExtra,
        }),
      ),
    );
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-service-version-mismatch',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'service', frontend: serviceFrontend },
        generateSignature: () => Effect.succeed({ viewerId: 'viewer-1' }),
      }),
    });
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'service',
        frontend: serviceFrontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Service commission hook did not render');
    }
    const result = await actions.commission();

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toMatchObject({
        code: 'frontend-version-changed',
        extra: mismatchExtra,
      });
    }
    expect(makeSharedWorkerSessionMock).not.toHaveBeenCalled();
  });

  it('keeps one commissioned acquisition until the last hook owner releases', async () => {
    const acquiredRelease = vi.fn(async () => encodeRight(undefined));
    const acquiredApi = {
      getFrontendState: vi.fn(),
      release: acquiredRelease,
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
        release: Effect.void,
      }),
    );
    const firstFrontendApiRelease = vi.fn();
    const secondFrontendApiRelease = vi.fn();
    const stateFrontendApiRelease = vi.fn();
    const ticketFrontendApiRelease = vi.fn();
    const pushFrontendApiRelease = vi.fn();
    fetchFrontendMock
      .mockReturnValueOnce(
        Effect.succeed({
          identity: {
            actor: {
              accountId: 'acct_commission',
              actorId: 'actr_commission',
            },
            accountId: 'acct_commission',
            accountName: frontend.accountName,
            actorId: 'actr_commission',
            actorName: frontend.actorName,
            deployId: 'deploy-commission',
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            generationId: 'gen_commission',
            systemEnvironmentId: 'sysenv_commission',
            systemId: 'sys_commission',
            systemVersion: '2.0.0',
            systemWorkerName: 'worker-commission',
          },
          frontendSpec: makeFrontendControllerSpec(frontend),
          frontendApi: mockFrontendApi,
          releaseFrontendApi: firstFrontendApiRelease,
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          identity: {
            actor: {
              accountId: 'acct_commission',
              actorId: 'actr_commission',
            },
            accountId: 'acct_commission',
            accountName: frontend.accountName,
            actorId: 'actr_commission',
            actorName: frontend.actorName,
            deployId: 'deploy-commission',
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            generationId: 'gen_commission',
            systemEnvironmentId: 'sysenv_commission',
            systemId: 'sys_commission',
            systemVersion: '2.0.0',
            systemWorkerName: 'worker-commission',
          },
          frontendSpec: makeFrontendControllerSpec(frontend),
          frontendApi: mockFrontendApi,
          releaseFrontendApi: secondFrontendApiRelease,
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          identity: {
            actor: {
              accountId: 'acct_commission',
              actorId: 'actr_commission',
            },
            accountId: 'acct_commission',
            accountName: frontend.accountName,
            actorId: 'actr_commission',
            actorName: frontend.actorName,
            deployId: 'deploy-commission',
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            generationId: 'gen_commission',
            systemEnvironmentId: 'sysenv_commission',
            systemId: 'sys_commission',
            systemVersion: '2.0.0',
            systemWorkerName: 'worker-commission',
          },
          frontendSpec: makeFrontendControllerSpec(frontend),
          frontendApi: mockFrontendApi,
          releaseFrontendApi: stateFrontendApiRelease,
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          identity: {
            actor: {
              accountId: 'acct_commission',
              actorId: 'actr_commission',
            },
            accountId: 'acct_commission',
            accountName: frontend.accountName,
            actorId: 'actr_commission',
            actorName: frontend.actorName,
            deployId: 'deploy-commission',
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            generationId: 'gen_commission',
            systemEnvironmentId: 'sysenv_commission',
            systemId: 'sys_commission',
            systemVersion: '2.0.0',
            systemWorkerName: 'worker-commission',
          },
          frontendSpec: makeFrontendControllerSpec(frontend),
          frontendApi: mockFrontendApi,
          releaseFrontendApi: ticketFrontendApiRelease,
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          identity: {
            actor: {
              accountId: 'acct_commission',
              actorId: 'actr_commission',
            },
            accountId: 'acct_commission',
            accountName: frontend.accountName,
            actorId: 'actr_commission',
            actorName: frontend.actorName,
            deployId: 'deploy-commission',
            frontendName: frontend.frontendName,
            frontendVersion: frontend.version,
            generationId: 'gen_commission',
            systemEnvironmentId: 'sysenv_commission',
            systemId: 'sys_commission',
            systemVersion: '2.0.0',
            systemWorkerName: 'worker-commission',
          },
          frontendSpec: makeFrontendControllerSpec(frontend),
          frontendApi: mockFrontendApi,
          releaseFrontendApi: pushFrontendApiRelease,
        }),
      );
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-shared',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'account', frontend },
        generateSignature: () => Effect.succeed({ userId: 'user-1' }),
      }),
    });
    const actions: Array<
      Readonly<{
        commission(): Promise<Either.Either<void, unknown>>;
        release(): Promise<Either.Either<void, unknown>>;
      }>
    > = [];

    function FirstProbe() {
      actions[0] = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    function SecondProbe() {
      actions[1] = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <FirstProbe />
          <SecondProbe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    const firstActions = actions[0];
    const secondActions = actions[1];
    if (firstActions === undefined || secondActions === undefined) {
      throw new Error('Commission hooks did not render');
    }
    expect(Either.isRight(await firstActions.commission())).toBe(true);
    expect(Either.isRight(await secondActions.commission())).toBe(true);
    expect(partitionApi.acquireFrontendReplica).toHaveBeenCalledOnce();
    expect(firstFrontendApiRelease).toHaveBeenCalledOnce();
    expect(secondFrontendApiRelease).toHaveBeenCalledOnce();

    const provider =
      partitionApi.acquireFrontendReplica.mock.calls[0]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Commissioned account provider was not registered');
    }
    await provider.getFrontendState();
    await provider.createFrontendWebSocketTicket();
    await provider.pushCommands([]);

    expect(fetchFrontendMock).toHaveBeenCalledTimes(5);
    expect(stateFrontendApiRelease).toHaveBeenCalledOnce();
    expect(ticketFrontendApiRelease).toHaveBeenCalledOnce();
    expect(pushFrontendApiRelease).toHaveBeenCalledOnce();

    expect(Either.isRight(await firstActions.release())).toBe(true);
    expect(acquiredRelease).not.toHaveBeenCalled();
    expect(Either.isRight(await secondActions.release())).toBe(true);
    expect(acquiredRelease).toHaveBeenCalledOnce();
    expect(stateFrontendApiRelease).toHaveBeenCalledOnce();
    expect(ticketFrontendApiRelease).toHaveBeenCalledOnce();
    expect(pushFrontendApiRelease).toHaveBeenCalledOnce();
  });

  it('returns account release before a pending commission and releases its late owner exactly once', async () => {
    const acquisitionBarrier = Promise.withResolvers<unknown>();
    const acquiredRelease = vi.fn(async () => encodeRight(undefined));
    const acquiredApi = {
      getFrontendState: vi.fn(),
      release: acquiredRelease,
    };
    const partitionApi = {
      acquireFrontendReplica: vi.fn(() => acquisitionBarrier.promise),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const rootRelease = vi.fn();
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.sync(rootRelease),
      }),
    );
    const frontendApiRelease = vi.fn();
    fetchFrontendMock.mockReturnValue(
      Effect.succeed({
        identity: {
          actor: {
            accountId: 'acct_late_account_commission',
            actorId: 'actr_late_account_commission',
          },
          accountId: 'acct_late_account_commission',
          accountName: frontend.accountName,
          actorId: 'actr_late_account_commission',
          actorName: frontend.actorName,
          deployId: 'deploy-late-account-commission',
          frontendName: frontend.frontendName,
          frontendVersion: frontend.version,
          generationId: 'gen_late_account_commission',
          systemEnvironmentId: 'sysenv_late_account_commission',
          systemId: 'sys_late_account_commission',
          systemVersion: '2.0.0',
          systemWorkerName: 'worker-late-account-commission',
        },
        frontendSpec: makeFrontendControllerSpec(frontend),
        frontendApi: mockFrontendApi,
        releaseFrontendApi: frontendApiRelease,
      }),
    );
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-late-account-owner',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'account', frontend },
        generateSignature: () => Effect.succeed({ userId: 'user-1' }),
      }),
    });
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'account',
        frontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Account commission hook did not render');
    }

    const pendingCommission = actions.commission();
    await vi.waitFor(() => {
      expect(partitionApi.acquireFrontendReplica).toHaveBeenCalledOnce();
    });
    expect(Either.isRight(await actions.release())).toBe(true);
    expect(acquiredRelease).not.toHaveBeenCalled();

    acquisitionBarrier.resolve(encodeRight(acquiredApi));
    expect(Either.isRight(await pendingCommission)).toBe(true);
    expect(acquiredRelease).toHaveBeenCalledOnce();
    expect(frontendApiRelease).toHaveBeenCalledOnce();

    expect(Either.isRight(await actions.release())).toBe(true);
    expect(acquiredRelease).toHaveBeenCalledOnce();
    await controller.release();
    expect(rootRelease).toHaveBeenCalledOnce();
  });

  it('returns service release before a pending commission and releases its late owner exactly once', async () => {
    const acquisitionBarrier = Promise.withResolvers<unknown>();
    const acquiredRelease = vi.fn(async () => encodeRight(undefined));
    const acquiredApi = {
      getFrontendState: vi.fn(),
      release: acquiredRelease,
    };
    const partitionApi = {
      acquireServiceFrontendReplica: vi.fn(() => acquisitionBarrier.promise),
      listAccountFrontendReplicas: vi.fn(async () => encodeRight([])),
      listServiceFrontendReplicas: vi.fn(async () => encodeRight([])),
    };
    const rootRelease = vi.fn();
    makeSharedWorkerSessionMock.mockReturnValue(
      Effect.succeed({
        api: {
          getPartitionApi: vi.fn(async () => partitionApi),
        },
        release: Effect.sync(rootRelease),
      }),
    );
    const frontendApiRelease = vi.fn();
    fetchServiceFrontendMock.mockReturnValue(
      Effect.succeed({
        identity: {
          actorId: 'actr_late_service_commission',
          systemId: 'sys_late_service_commission',
          generationId: 'gen_late_service_commission',
          systemVersion: '2.0.0',
          systemWorkerName: 'worker-late-service-commission',
          serviceName: serviceFrontend.serviceName,
          actorName: serviceFrontend.actorName,
          frontendName: serviceFrontend.frontendName,
          frontendVersion: serviceFrontend.version,
        },
        frontendSpec: makeServiceFrontendControllerSpec(serviceFrontend),
        frontendApi: mockFrontendApi,
        releaseFrontendApi: frontendApiRelease,
      }),
    );
    const controller = makeBrowserPartitionController({
      partitionKey: 'commission-late-service-owner',
      isSharedWorkerEnabled: true,
      getFrontendAuthenticator: () => ({
        frontend: { kind: 'service', frontend: serviceFrontend },
        generateSignature: () => Effect.succeed({ viewerId: 'viewer-1' }),
      }),
    });
    let actions: Readonly<{
      commission(): Promise<Either.Either<void, unknown>>;
      release(): Promise<Either.Either<void, unknown>>;
    }> | null = null;

    function Probe() {
      actions = useCommissionFrontendReplica({
        kind: 'service',
        frontend: serviceFrontend,
        sessionRuntime,
      });
      return null;
    }

    await act(async () => {
      root.render(
        <BrowserPartitionControllerContext.Provider value={controller}>
          <Probe />
        </BrowserPartitionControllerContext.Provider>,
      );
    });
    if (actions === null) {
      throw new Error('Service commission hook did not render');
    }

    const pendingCommission = actions.commission();
    await vi.waitFor(() => {
      expect(partitionApi.acquireServiceFrontendReplica).toHaveBeenCalledOnce();
    });
    expect(Either.isRight(await actions.release())).toBe(true);
    expect(acquiredRelease).not.toHaveBeenCalled();

    acquisitionBarrier.resolve(encodeRight(acquiredApi));
    expect(Either.isRight(await pendingCommission)).toBe(true);
    expect(acquiredRelease).toHaveBeenCalledOnce();
    expect(frontendApiRelease).toHaveBeenCalledOnce();

    expect(Either.isRight(await actions.commission())).toBe(true);
    const provider =
      partitionApi.acquireServiceFrontendReplica.mock.calls[1]?.[0].provider;
    if (provider === undefined) {
      throw new Error('Commissioned service provider was not registered');
    }
    await provider.getFrontendState();
    await provider.createFrontendWebSocketTicket();

    expect(fetchServiceFrontendMock).toHaveBeenCalledTimes(4);
    expect(frontendApiRelease).toHaveBeenCalledTimes(4);

    expect(Either.isRight(await actions.release())).toBe(true);
    expect(acquiredRelease).toHaveBeenCalledTimes(2);
    await controller.release();
    expect(rootRelease).toHaveBeenCalledOnce();
  });
});
