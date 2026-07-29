import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { Effect, Either, Layer, Schema } from 'effect';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import type { ICloudApiKeyIdentity } from '../CloudApiKeyJwtClaimsSchema';
import { makeDispatchRuntime } from '../makeDispatchRuntime';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';
import { ZerospinApis } from '../ZerospinApis/ZerospinApis';

import { ServiceFrontendApi } from './ServiceFrontendApi';
import { ServiceFrontendApiFailure } from './ServiceFrontendApiFailure';

const systemId = Schema.decodeUnknownSync(
  makeAbbreviationIdSchema(coreAbbreviations.system),
)('sys_service_frontend_test');
const actorId = Schema.decodeUnknownSync(
  makeAbbreviationIdSchema(coreAbbreviations.actor),
)('actr_service_frontend_test');
const getSystemWorker = vi.fn();
const resolveApiKey = vi.fn(() =>
  Effect.succeed({
    organizationId: 'org_test',
    systemId,
    systemEnvironmentId: 'dev',
    keyType: 'publishable',
    keyPairName: 'service-test',
    clerkUserId: 'user_service_test',
  } satisfies ICloudApiKeyIdentity),
);
const runtime = makeDispatchRuntime({
  systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
    get: getSystemWorker,
  }),
  apiKeyIdentityResolver: Layer.succeed(ApiKeyIdentityResolver, {
    resolve: resolveApiKey,
  }),
});

describe('service frontend admission and capability', () => {
  beforeEach(() => {
    getSystemWorker.mockReset();
    resolveApiKey.mockClear();
  });

  afterAll(async () => {
    await runtime.dispose();
  });

  it('authenticates once and returns exact identity, complete spec, and a two-leaf bound capability', async () => {
    const dispose = vi.fn();
    const authenticateServiceFrontend = vi.fn(async () => encodeRight(actorId));
    const frontendSpec = {
      serviceName: 'catalog',
      actorName: 'shopper',
      frontendName: 'products',
      version: '2.0.0',
      models: {},
      signatureJsonSchema: {},
    };
    getSystemWorker.mockReturnValue({
      authenticateServiceFrontend,
      getServiceFrontendSpec: vi.fn(async () => encodeRight(frontendSpec)),
      getSystemSpec: vi.fn(async () =>
        encodeRight({
          name: 'shopping',
          version: '7.0.0',
          accountControllers: {},
          serviceControllers: {},
        }),
      ),
      [Symbol.dispose]: dispose,
    });
    const apis = new ZerospinApis({
      deployId: 'dpl_service_test',
      generationId: 'gen_service_test',
      runtime,
    });

    const admitted = await apis.getServiceFrontendApi({
      publishableKey: 'pk_service_test',
      serviceName: 'catalog',
      actorName: 'shopper',
      frontendName: 'products',
      signature: { subject: 'customer-1' },
    });

    expect(admitted._tag).toBe('Success');
    if (admitted._tag === 'Success') {
      expect(admitted.identity).toEqual({
        actorId,
        systemId,
        generationId: 'gen_service_test',
        systemVersion: '7.0.0',
        systemWorkerName: 'sys_service_frontend_test:user_service_test',
        serviceName: 'catalog',
        actorName: 'shopper',
        frontendName: 'products',
        frontendVersion: '2.0.0',
      });
      expect(admitted.frontendSpec).toEqual(frontendSpec);
      expect(admitted.frontendApi).toBeInstanceOf(ServiceFrontendApi);
      expect('pushCommands' in admitted.frontendApi).toBe(false);
      expect('executeServiceQuery' in admitted.frontendApi).toBe(false);
      expect('fetchActor' in admitted.frontendApi).toBe(false);
    }
    expect(authenticateServiceFrontend).toHaveBeenCalledTimes(1);
    expect(authenticateServiceFrontend).toHaveBeenCalledWith({
      deployId: 'dpl_service_test',
      generationId: 'gen_service_test',
      serviceName: 'catalog',
      actorName: 'shopper',
      frontendName: 'products',
      signature: { subject: 'customer-1' },
    });
    expect(resolveApiKey).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('captures admission failure without resolving spec, state, projection, or ticket work', async () => {
    const failure = new ZerospinError({
      code: 'service-frontend-authentication-failed',
      message: 'No service actor matched the signature',
    });
    const dispose = vi.fn();
    const getServiceFrontendSpec = vi.fn();
    const getSystemSpec = vi.fn();
    const getServiceFrontendState = vi.fn();
    const createServiceFrontendWebSocketTicket = vi.fn();
    getSystemWorker.mockReturnValue({
      authenticateServiceFrontend: vi.fn(async () => encodeLeft(failure)),
      getServiceFrontendSpec,
      getSystemSpec,
      getServiceFrontendState,
      createServiceFrontendWebSocketTicket,
      [Symbol.dispose]: dispose,
    });
    const apis = new ZerospinApis({
      deployId: 'dpl_service_test',
      generationId: 'gen_service_test',
      runtime,
    });

    const admitted = await apis.getServiceFrontendApi({
      publishableKey: 'pk_service_test',
      serviceName: 'catalog',
      actorName: 'shopper',
      frontendName: 'products',
      signature: { subject: 'unknown' },
    });

    expect(admitted._tag).toBe('Failure');
    if (admitted._tag === 'Failure') {
      expect(admitted.failure.code).toBe(
        'service-frontend-authentication-failed',
      );
      expect(admitted.frontendApi).toBeInstanceOf(ServiceFrontendApiFailure);
      const stateEnvelope = await admitted.frontendApi.getFrontendState({
        args: [],
        traceContext: null,
      });
      const ticketEnvelope =
        await admitted.frontendApi.createFrontendWebSocketTicket({
          args: [],
          traceContext: null,
        });
      expect(stateEnvelope.result).toEqual(ticketEnvelope.result);
      expect(stateEnvelope.link).toBe(null);
      expect(ticketEnvelope.link).toBe(null);
    }
    expect(getServiceFrontendSpec).not.toHaveBeenCalled();
    expect(getSystemSpec).not.toHaveBeenCalled();
    expect(getServiceFrontendState).not.toHaveBeenCalled();
    expect(createServiceFrontendWebSocketTicket).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid returned actor id after authentication and before projection or ticket work', async () => {
    const authenticateServiceFrontend = vi.fn(async () =>
      encodeRight('not-an-actor-id'),
    );
    const getServiceFrontendSpec = vi.fn();
    const getSystemSpec = vi.fn();
    const getServiceFrontendState = vi.fn();
    const createServiceFrontendWebSocketTicket = vi.fn();
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      authenticateServiceFrontend,
      getServiceFrontendSpec,
      getSystemSpec,
      getServiceFrontendState,
      createServiceFrontendWebSocketTicket,
      [Symbol.dispose]: dispose,
    });
    const apis = new ZerospinApis({
      deployId: 'dpl_service_test',
      generationId: 'gen_service_test',
      runtime,
    });

    const admitted = await apis.getServiceFrontendApi({
      publishableKey: 'pk_service_test',
      serviceName: 'catalog',
      actorName: 'shopper',
      frontendName: 'products',
      signature: { subject: 'customer-invalid-id' },
    });

    expect(admitted._tag).toBe('Failure');
    if (admitted._tag === 'Failure') {
      expect(admitted.failure.code).toBe('service-frontend-actor-id-invalid');
    }
    expect(authenticateServiceFrontend).toHaveBeenCalledTimes(1);
    expect(getServiceFrontendSpec).not.toHaveBeenCalled();
    expect(getSystemSpec).not.toHaveBeenCalled();
    expect(getServiceFrontendState).not.toHaveBeenCalled();
    expect(createServiceFrontendWebSocketTicket).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects a returned spec for a different actor-bound target before projection or ticket work', async () => {
    const authenticateServiceFrontend = vi.fn(async () => encodeRight(actorId));
    const getServiceFrontendSpec = vi.fn(async () =>
      encodeRight({
        serviceName: 'catalog',
        actorName: 'different-actor',
        frontendName: 'products',
        version: '2.0.0',
        models: {},
        signatureJsonSchema: {},
      }),
    );
    const getSystemSpec = vi.fn();
    const getServiceFrontendState = vi.fn();
    const createServiceFrontendWebSocketTicket = vi.fn();
    const dispose = vi.fn();
    getSystemWorker.mockReturnValue({
      authenticateServiceFrontend,
      getServiceFrontendSpec,
      getSystemSpec,
      getServiceFrontendState,
      createServiceFrontendWebSocketTicket,
      [Symbol.dispose]: dispose,
    });
    const apis = new ZerospinApis({
      deployId: 'dpl_service_test',
      generationId: 'gen_service_test',
      runtime,
    });

    const admitted = await apis.getServiceFrontendApi({
      publishableKey: 'pk_service_test',
      serviceName: 'catalog',
      actorName: 'shopper',
      frontendName: 'products',
      signature: { subject: 'customer-target-mismatch' },
    });

    expect(admitted._tag).toBe('Failure');
    if (admitted._tag === 'Failure') {
      expect(admitted.failure.code).toBe(
        'service-frontend-admission-target-mismatch',
      );
    }
    expect(authenticateServiceFrontend).toHaveBeenCalledTimes(1);
    expect(getServiceFrontendSpec).toHaveBeenCalledTimes(1);
    expect(getSystemSpec).not.toHaveBeenCalled();
    expect(getServiceFrontendState).not.toHaveBeenCalled();
    expect(createServiceFrontendWebSocketTicket).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('pins both leaf calls and persists their root telemetry', async () => {
    const stateDispose = vi.fn();
    const ticketDispose = vi.fn();
    const getServiceFrontendState = vi.fn(async () =>
      encodeRight({
        actorId,
        systemId,
        generationId: 'gen_service_test',
        systemVersion: '7.0.0',
        systemWorkerName: 'sys_service_frontend_test:user_service_test',
        serviceName: 'catalog',
        actorName: 'shopper',
        frontendName: 'products',
        frontendIndex: 4,
        resources: [],
      }),
    );
    const createServiceFrontendWebSocketTicket = vi.fn(async () =>
      encodeRight({
        ticket: 'gen_service_successor.ticket',
        systemId,
        generationId: 'gen_service_successor',
        serviceName: 'catalog',
        actorId,
        actorName: 'shopper',
        frontendName: 'products',
        frontendVersion: '3.0.0',
      }),
    );
    const stateTelemetry = vi.fn(async (props: { batch: ITelemetryBatch }) => {
      expect(props.batch.spans.at(-1)).toMatchObject({
        name: 'ServiceFrontendApi.getFrontendState',
        status: 'ok',
      });
      return encodeRight(undefined);
    });
    const ticketTelemetry = vi.fn(async (props: { batch: ITelemetryBatch }) => {
      expect(props.batch.spans.at(-1)).toMatchObject({
        name: 'ServiceFrontendApi.createFrontendWebSocketTicket',
        status: 'ok',
      });
      return encodeRight(undefined);
    });
    getSystemWorker
      .mockReturnValueOnce({
        getServiceFrontendState,
        appendTelemetryBatch: stateTelemetry,
        [Symbol.dispose]: stateDispose,
      })
      .mockReturnValueOnce({
        createServiceFrontendWebSocketTicket,
        appendTelemetryBatch: ticketTelemetry,
        [Symbol.dispose]: ticketDispose,
      });
    const api = new ServiceFrontendApi({
      authResults: {
        actorId,
        actorName: 'shopper',
        deployId: 'dpl_service_test',
        frontendName: 'products',
        frontendVersion: '2.0.0',
        generationId: 'gen_service_test',
        serviceName: 'catalog',
        systemId,
        systemVersion: '7.0.0',
        systemWorkerName: 'sys_service_frontend_test:user_service_test',
      },
      runtime,
    });

    const stateEnvelope = await api.getFrontendState({
      args: [],
      traceContext: null,
    });
    const ticketEnvelope = await api.createFrontendWebSocketTicket({
      args: [],
      traceContext: null,
    });

    const state = await Effect.runPromise(decodeRpc(stateEnvelope.result));
    const ticket = await Effect.runPromise(decodeRpc(ticketEnvelope.result));
    expect(state.frontendIndex).toBe(4);
    expect(ticket).toEqual({
      ticket: 'gen_service_successor.ticket',
      systemId,
      generationId: 'gen_service_successor',
      serviceName: 'catalog',
      actorId,
      actorName: 'shopper',
      frontendName: 'products',
      frontendVersion: '3.0.0',
    });
    expect(getServiceFrontendState).toHaveBeenCalledWith({
      actorId,
      actorName: 'shopper',
      deployId: 'dpl_service_test',
      frontendName: 'products',
      generationId: 'gen_service_test',
      serviceName: 'catalog',
      systemWorkerName: 'sys_service_frontend_test:user_service_test',
    });
    expect(createServiceFrontendWebSocketTicket).toHaveBeenCalledWith({
      actorId,
      actorName: 'shopper',
      deployId: 'dpl_service_test',
      frontendName: 'products',
      generationId: 'gen_service_test',
      serviceName: 'catalog',
    });
    expect(stateTelemetry).toHaveBeenCalledTimes(1);
    expect(ticketTelemetry).toHaveBeenCalledTimes(1);
    expect(stateDispose).toHaveBeenCalledTimes(1);
    expect(ticketDispose).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected arguments before resolving a leaf SystemWorker', async () => {
    const api = new ServiceFrontendApi({
      authResults: {
        actorId,
        actorName: 'shopper',
        deployId: 'dpl_service_test',
        frontendName: 'products',
        frontendVersion: '2.0.0',
        generationId: 'gen_service_test',
        serviceName: 'catalog',
        systemId,
        systemVersion: '7.0.0',
        systemWorkerName: 'sys_service_frontend_test:user_service_test',
      },
      runtime,
    });

    const envelope = await Reflect.apply(api.getFrontendState, api, [
      { args: ['unexpected'], traceContext: null },
    ]);
    const result = await Effect.runPromise(
      decodeRpc(envelope.result).pipe(Effect.either),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left.code).toBe('service-frontend-api-arguments-invalid');
    }
    expect(getSystemWorker).not.toHaveBeenCalled();
  });
});
