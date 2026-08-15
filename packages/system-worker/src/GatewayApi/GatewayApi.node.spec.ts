import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { Effect, Layer, Schema } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICloudApiKeyIdentity } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver.js';
import { DevDeployApi } from '../DevDeployApi/DevDeployApi.js';
import { makeSystemRuntime } from '../makeSystemRuntime.js';
import { ProductionDeployApi } from '../ProductionDeployApi/ProductionDeployApi.js';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver.js';

import { GatewayApi } from './GatewayApi.js';

const { getSystemRepo } = vi.hoisted(() => ({ getSystemRepo: vi.fn() }));
vi.mock('../SystemRepo/SystemRepo.js', () => ({
  SystemRepo: { getRepo: getSystemRepo },
}));

const systemId = Schema.decodeUnknownSync(makeAbbreviationIdSchema('sys'))(
  'sys_gateway_test',
);
const authenticationLock = {
  signature: {
    version: '1.0.0',
    schemaJsonSchema: { type: 'object' },
  },
};
const getSystemWorker = vi.fn();
const runtime = makeSystemRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
});

describe('GatewayApi', () => {
  beforeEach(() => {
    getSystemWorker.mockReset();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('exposes only the stable Gateway capability surface', () => {
    expect(
      Object.getOwnPropertyNames(GatewayApi.prototype)
        .filter(name => name !== 'constructor')
        .toSorted(),
    ).toEqual([
      'getAuthenticatedApi',
      'getDevDeployApi',
      'getProductionDeployApi',
      'getSystemApi',
    ]);
    expect(Object.hasOwn(GatewayApi.prototype, 'authenticate')).toBe(false);
  });

  it('acquires environment-bound deploy capabilities before activation and replays wrong-environment acquisition failures', async () => {
    const getActiveGenerationId = vi.fn(async () =>
      encodeLeft(
        new ZerospinError({
          code: 'system-not-ready',
          message: 'No System generation is active',
          status: 503,
        }),
      ),
    );
    const startDeploy = vi.fn(async () => encodeRight(undefined));
    const getDeploy = vi.fn(async () => encodeRight(undefined));
    const getReadiness = vi.fn(async () => encodeRight(undefined));
    const apiKeyIdentityResolver = {
      resolve: vi.fn(() =>
        Effect.succeed({
          systemId,
          systemEnvironmentId: 'dev',
          keyType: 'publishable',
          systemWorkerName: 'sys_gateway_test:dev',
        } satisfies ICloudApiKeyIdentity),
      ),
    };
    const devGateway = new GatewayApi({
      apiKeyIdentityResolver,
      environment: 'dev',
      runtime,
      systemRepo: {
        getActiveGenerationId,
        getDeploy,
        getReadiness,
        startDeploy,
      },
    });
    const productionGateway = new GatewayApi({
      apiKeyIdentityResolver,
      environment: 'production',
      runtime,
      systemRepo: {
        getActiveGenerationId,
        getDeploy,
        getReadiness,
        startDeploy,
      },
    });

    const devDeployApi = await devGateway.getDevDeployApi();
    const productionDeployApi =
      await productionGateway.getProductionDeployApi();
    const devProductionFailure = await devGateway.getProductionDeployApi();
    const productionDevFailure = await productionGateway.getDevDeployApi();

    expect(devDeployApi).toBeInstanceOf(DevDeployApi);
    expect(productionDeployApi).toBeInstanceOf(ProductionDeployApi);
    expect(
      await Effect.runPromise(
        decodeRpc(await devProductionFailure.getReadiness()).pipe(Effect.flip),
      ),
    ).toMatchObject({
      code: 'production-deploy-api-unavailable',
      status: 400,
    });
    expect(
      await Effect.runPromise(
        decodeRpc(
          await productionDevFailure.startDeploy({ clean: false }),
        ).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'dev-deploy-api-unavailable', status: 400 });
    expect(
      await Effect.runPromise(
        decodeRpc(
          await productionDevFailure.getDeploy({ deployId: 'dpl_ignored' }),
        ).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'dev-deploy-api-unavailable', status: 400 });
    expect(
      await Effect.runPromise(
        decodeRpc(await productionDevFailure.getReadiness()).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'dev-deploy-api-unavailable', status: 400 });
    expect(getActiveGenerationId).not.toHaveBeenCalled();
    expect(apiKeyIdentityResolver.resolve).not.toHaveBeenCalled();
  });

  it('accepts only publishable keys for AuthenticatedApi and only secret keys for SystemApi', async () => {
    const getActiveGenerationId = vi.fn(async () =>
      encodeRight('gen_gateway_keys'),
    );
    const resolve = vi.fn(({ apiKey }: { apiKey: string }) =>
      Effect.succeed({
        systemId,
        systemEnvironmentId: 'dev',
        keyType: apiKey.startsWith('pk_') ? 'publishable' : 'secret',
        systemWorkerName: 'sys_gateway_test:dev',
      } satisfies ICloudApiKeyIdentity),
    );
    const authenticate = vi.fn(async () =>
      encodeRight({
        authenticationLock,
        systemName: 'gateway-test',
        systemVersion: '1.0.0',
        userId: 'user_gateway_test',
      }),
    );
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      authenticate,
      [Symbol.dispose]: dispose,
    });
    const gateway = new GatewayApi({
      apiKeyIdentityResolver: { resolve },
      environment: 'dev',
      runtime,
      systemRepo: {
        getActiveGenerationId,
        getDeploy: vi.fn(async () => encodeRight(undefined)),
        getReadiness: vi.fn(async () => encodeRight(undefined)),
        startDeploy: vi.fn(async () => encodeRight(undefined)),
      },
    });

    const authenticatedApi = await gateway.getAuthenticatedApi({
      publishableKey: 'pk_gateway_test',
      authenticationLock,
      signature: { userId: 'user_gateway_test' },
    });
    const systemApi = await gateway.getSystemApi({
      zerospinSecretKey: 'sk_gateway_test',
    });
    const secretAuthenticatedFailure = await gateway.getAuthenticatedApi({
      publishableKey: 'sk_gateway_test',
      authenticationLock,
      signature: { userId: 'user_gateway_test' },
    });
    const publishableSystemFailure = await gateway.getSystemApi({
      zerospinSecretKey: 'pk_gateway_test',
    });

    expect(
      await Effect.runPromise(
        decodeRpc(await authenticatedApi.getAuthentication()),
      ),
    ).toEqual({
      authenticationLock,
      systemId,
      systemName: 'gateway-test',
      systemVersion: '1.0.0',
      userId: 'user_gateway_test',
    });
    expect(systemApi.constructor.name).toBe('SystemApi');
    expect(
      await Effect.runPromise(
        decodeRpc(await secretAuthenticatedFailure.getAuthentication()).pipe(
          Effect.flip,
        ),
      ),
    ).toMatchObject({ code: 'secret-key-not-allowed' });
    const publishableSystemEnvelope = await publishableSystemFailure.hello({
      args: [],
      traceContext: null,
    });
    expect(
      await Effect.runPromise(
        decodeRpc(publishableSystemEnvelope.result).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'publishable-key-not-allowed' });
    expect(authenticate).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(getActiveGenerationId).toHaveBeenCalledTimes(4);
    expect(resolve).toHaveBeenCalledTimes(4);
  });

  it('snapshots getActiveGenerationId once for each AuthenticatedApi and gives refreshed frontend children the new snapshot', async () => {
    const aggregateId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema('acct'),
    )('acct_gateway_snapshot');
    const aggregateFrontendLock = {
      systemName: 'gateway-test',
      frontendName: 'dashboard',
      models: {},
      contracts: {},
    };
    const frontendSpec = {
      kind: 'aggregate',
      systemName: 'gateway-test',
      aggregateName: 'account',
      frontendName: 'dashboard',
      modelNames: [],
      models: {},
      contracts: {},
      aggregateFrontendLock,
    } satisfies IFrontendControllerSpec;
    const getActiveGenerationId = vi
      .fn()
      .mockResolvedValueOnce(encodeRight('gen_authenticated_first'))
      .mockResolvedValueOnce(encodeRight('gen_authenticated_second'));
    const firstAuthenticationDispose = vi.fn();
    const secondAuthenticationDispose = vi.fn();
    const firstAdmissionDispose = vi.fn();
    const secondAdmissionDispose = vi.fn();
    const firstAuthorizeAggregateFrontend = vi.fn(async () =>
      encodeRight({
        actorRef: {
          aggregateId,
          aggregateName: 'account',
          userId: 'user_gateway_test',
        },
        aggregateFrontendLock,
        frontendSpec,
        systemVersion: '1.1.0',
      }),
    );
    const secondAuthorizeAggregateFrontend = vi.fn(async () =>
      encodeRight({
        actorRef: {
          aggregateId,
          aggregateName: 'account',
          userId: 'user_gateway_test',
        },
        aggregateFrontendLock,
        frontendSpec,
        systemVersion: '1.1.0',
      }),
    );
    getSystemWorker
      .mockReturnValueOnce({
        authenticate: vi.fn(async () =>
          encodeRight({
            authenticationLock,
            systemName: 'gateway-test',
            systemVersion: '1.0.0',
            userId: 'user_gateway_test',
          }),
        ),
        [Symbol.dispose]: firstAuthenticationDispose,
      })
      .mockReturnValueOnce({
        authenticate: vi.fn(async () =>
          encodeRight({
            authenticationLock,
            systemName: 'gateway-test',
            systemVersion: '1.0.0',
            userId: 'user_gateway_test',
          }),
        ),
        [Symbol.dispose]: secondAuthenticationDispose,
      })
      .mockReturnValueOnce({
        authorizeAggregateFrontend: firstAuthorizeAggregateFrontend,
        [Symbol.dispose]: firstAdmissionDispose,
      })
      .mockReturnValueOnce({
        authorizeAggregateFrontend: secondAuthorizeAggregateFrontend,
        [Symbol.dispose]: secondAdmissionDispose,
      });
    const gateway = new GatewayApi({
      apiKeyIdentityResolver: {
        resolve: vi.fn(() =>
          Effect.succeed({
            systemId,
            systemEnvironmentId: 'dev',
            keyType: 'publishable',
            systemWorkerName: 'sys_gateway_test:dev',
          } satisfies ICloudApiKeyIdentity),
        ),
      },
      environment: 'dev',
      runtime,
      systemRepo: {
        getActiveGenerationId,
        getDeploy: vi.fn(async () => encodeRight(undefined)),
        getReadiness: vi.fn(async () => encodeRight(undefined)),
        startDeploy: vi.fn(async () => encodeRight(undefined)),
      },
    });

    const first = await gateway.getAuthenticatedApi({
      publishableKey: 'pk_gateway_test',
      authenticationLock,
      signature: { userId: 'user_gateway_test' },
    });
    const second = await gateway.getAuthenticatedApi({
      publishableKey: 'pk_gateway_test',
      authenticationLock,
      signature: { userId: 'user_gateway_test' },
    });
    const firstAggregateApi = await first.getAggregateFrontendApi({
      aggregateId,
      aggregateName: 'account',
      frontendName: 'dashboard',
      aggregateFrontendLock,
    });
    const secondAggregateApi = await second.getAggregateFrontendApi({
      aggregateId,
      aggregateName: 'account',
      frontendName: 'dashboard',
      aggregateFrontendLock,
    });

    expect(first).not.toBe(second);
    expect(
      await Effect.runPromise(
        decodeRpc(await firstAggregateApi.getAdmission()),
      ),
    ).toMatchObject({ systemVersion: '1.1.0' });
    expect(
      await Effect.runPromise(
        decodeRpc(await secondAggregateApi.getAdmission()),
      ),
    ).toMatchObject({ systemVersion: '1.1.0' });
    expect(firstAuthorizeAggregateFrontend).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: 'gen_authenticated_first' }),
    );
    expect(secondAuthorizeAggregateFrontend).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: 'gen_authenticated_second' }),
    );
    expect(getActiveGenerationId).toHaveBeenCalledTimes(2);
    expect(firstAuthenticationDispose).toHaveBeenCalledOnce();
    expect(secondAuthenticationDispose).toHaveBeenCalledOnce();
    expect(firstAdmissionDispose).toHaveBeenCalledOnce();
    expect(secondAdmissionDispose).toHaveBeenCalledOnce();
  });

  it('snapshots getActiveGenerationId once for each SystemApi and refresh acquires a new snapshot', async () => {
    const getActiveGenerationId = vi
      .fn()
      .mockResolvedValueOnce(encodeRight('gen_system_first'))
      .mockResolvedValueOnce(encodeRight('gen_system_second'));
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const firstHello = vi.fn(async () => encodeRight('first'));
    const secondHello = vi.fn(async () => encodeRight('second'));
    getSystemWorker
      .mockReturnValueOnce({
        hello: firstHello,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: firstDispose,
      })
      .mockReturnValueOnce({
        hello: secondHello,
        appendTelemetryBatch: vi.fn(async () => encodeRight(undefined)),
        [Symbol.dispose]: secondDispose,
      });
    const gateway = new GatewayApi({
      apiKeyIdentityResolver: {
        resolve: vi.fn(() =>
          Effect.succeed({
            systemId,
            systemEnvironmentId: 'dev',
            keyType: 'secret',
            systemWorkerName: 'sys_gateway_test:dev',
          } satisfies ICloudApiKeyIdentity),
        ),
      },
      environment: 'dev',
      runtime,
      systemRepo: {
        getActiveGenerationId,
        getDeploy: vi.fn(async () => encodeRight(undefined)),
        getReadiness: vi.fn(async () => encodeRight(undefined)),
        startDeploy: vi.fn(async () => encodeRight(undefined)),
      },
    });

    const first = await gateway.getSystemApi({
      zerospinSecretKey: 'sk_gateway_test',
    });
    const second = await gateway.getSystemApi({
      zerospinSecretKey: 'sk_gateway_test',
    });
    const firstEnvelope = await first.hello({
      args: [],
      traceContext: null,
    });
    const secondEnvelope = await second.hello({
      args: [],
      traceContext: null,
    });

    expect(await Effect.runPromise(decodeRpc(firstEnvelope.result))).toBe(
      'first',
    );
    expect(await Effect.runPromise(decodeRpc(secondEnvelope.result))).toBe(
      'second',
    );
    expect(firstHello).toHaveBeenCalledWith({
      generationId: 'gen_system_first',
    });
    expect(secondHello).toHaveBeenCalledWith({
      generationId: 'gen_system_second',
    });
    expect(getActiveGenerationId).toHaveBeenCalledTimes(2);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('preserves known active-generation failures and maps only unknown transport rejection to gateway-infrastructure-failure', async () => {
    const encodedFailure = new ZerospinError({
      code: 'system-deploy-activating',
      message: 'The selected System deploy is activating',
      status: 503,
    });
    const thrownFailure = new ZerospinError({
      code: 'system-deploy-failed',
      message: 'The selected System deploy failed',
      status: 500,
    });
    const getActiveGenerationId = vi
      .fn()
      .mockResolvedValueOnce(encodeLeft(encodedFailure))
      .mockRejectedValueOnce(thrownFailure)
      .mockRejectedValueOnce(new Error('active generation transport closed'))
      .mockRejectedValueOnce(new Error('active generation transport closed'));
    const resolve = vi.fn(() =>
      Effect.succeed({
        systemId,
        systemEnvironmentId: 'dev',
        keyType: 'secret',
        systemWorkerName: 'sys_gateway_test:dev',
      } satisfies ICloudApiKeyIdentity),
    );
    const gateway = new GatewayApi({
      apiKeyIdentityResolver: { resolve },
      environment: 'dev',
      runtime,
      systemRepo: {
        getActiveGenerationId,
        getDeploy: vi.fn(async () => encodeRight(undefined)),
        getReadiness: vi.fn(async () => encodeRight(undefined)),
        startDeploy: vi.fn(async () => encodeRight(undefined)),
      },
    });

    const encodedSystemFailure = await gateway.getSystemApi({
      zerospinSecretKey: 'sk_gateway_test',
    });
    const thrownAuthenticatedFailure = await gateway.getAuthenticatedApi({
      publishableKey: 'pk_gateway_test',
      authenticationLock,
      signature: { userId: 'user_gateway_test' },
    });
    const unknownSystemFailure = await gateway.getSystemApi({
      zerospinSecretKey: 'sk_gateway_test',
    });
    const unknownAuthenticatedFailure = await gateway.getAuthenticatedApi({
      publishableKey: 'pk_gateway_test',
      authenticationLock,
      signature: { userId: 'user_gateway_test' },
    });

    const encodedSystemEnvelope = await encodedSystemFailure.hello({
      args: [],
      traceContext: null,
    });
    const unknownSystemEnvelope = await unknownSystemFailure.hello({
      args: [],
      traceContext: null,
    });
    expect(
      await Effect.runPromise(
        decodeRpc(encodedSystemEnvelope.result).pipe(Effect.flip),
      ),
    ).toMatchObject({ code: 'system-deploy-activating', status: 503 });
    expect(
      await Effect.runPromise(
        decodeRpc(await thrownAuthenticatedFailure.getAuthentication()).pipe(
          Effect.flip,
        ),
      ),
    ).toMatchObject({ code: 'system-deploy-failed', status: 500 });
    expect(
      await Effect.runPromise(
        decodeRpc(unknownSystemEnvelope.result).pipe(Effect.flip),
      ),
    ).toMatchObject({
      code: 'gateway-infrastructure-failure',
      cause: expect.stringContaining('active generation transport closed'),
    });
    expect(
      await Effect.runPromise(
        decodeRpc(await unknownAuthenticatedFailure.getAuthentication()).pipe(
          Effect.flip,
        ),
      ),
    ).toMatchObject({
      code: 'gateway-infrastructure-failure',
      cause: expect.stringContaining('active generation transport closed'),
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(getSystemWorker).not.toHaveBeenCalled();
  });
});
