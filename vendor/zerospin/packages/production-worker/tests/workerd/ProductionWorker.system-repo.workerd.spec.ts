import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
  StagedReplicaCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { newWebSocketRpcSession } from 'capnweb';
import {
  abortAllDurableObjects,
  reset,
  runInDurableObject,
  SELF,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { authenticationSignature, main, system } from 'system';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedTestState } from './productionSeeds.fixture';

beforeEach(async () => {
  await reset();
  seedTestState.completions = 0;
  seedTestState.defect = '';
  seedTestState.failure = '';
  seedTestState.runs = 0;
});

describe('ProductionWorker Worker-hosted Gateway lifecycle', () => {
  it('handshakes before activation, exposes only the exact socket routes, and treats ordinary paths as Gateway ingress', async () => {
    for (const pathname of [
      '/ws-aggregate-frontend-blocks',
      '/ws-service-frontend-blocks',
    ]) {
      const nonUpgrade = await SELF.fetch(
        new Request(`https://production-worker.test${pathname}`),
      );
      expect(nonUpgrade.status).toBe(426);
      expect(await nonUpgrade.json()).toEqual({
        message: 'Expected WebSocket upgrade',
      });

      const invalidParameters = await SELF.fetch(
        new Request(`https://production-worker.test${pathname}`, {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(invalidParameters.status).toBe(400);
      expect(await invalidParameters.json()).toEqual({
        message: 'Missing or invalid WebSocket parameters',
      });
    }

    for (const pathname of ['/rpc', '/ordinary-gateway-ingress']) {
      const response = await SELF.fetch(
        new Request(`https://production-worker.test${pathname}`, {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(response.status).toBe(101);
      response.webSocket!.accept();
      using gatewayApi = newWebSocketRpcSession<GatewayApi>(
        response.webSocket!,
      );
      using devDeployApi = await gatewayApi.getDevDeployApi();
      expect(await devDeployApi.startDeploy({ clean: false })).toMatchObject({
        _tag: 'Left',
        left: { code: 'dev-deploy-api-unavailable', status: 400 },
      });
    }
    expect(seedTestState.runs).toBe(0);
  });

  it('allocates on readiness, serves Gateway capabilities, accepts ticket-only sockets, and remains ready after eviction', async () => {
    const rpcResponse = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(rpcResponse.status).toBe(101);
    rpcResponse.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(
      rpcResponse.webSocket!,
    );
    using productionDeployApi = await gatewayApi.getProductionDeployApi();
    await Effect.runPromise(
      decodeRpc(await productionDeployApi.getReadiness()),
    );

    const beforeRestart = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => ({
        deploys: state.storage.sql
          .exec<
            Readonly<{
              clean: number;
              generationId: string;
              id: string;
              status: string;
              workerVersionId: string;
            }>
          >(
            'SELECT id, generationId, workerVersionId, clean, status FROM deploy ORDER BY startedAt',
          )
          .toArray(),
        generations: state.storage.sql
          .exec<Readonly<{ phase: string; generationId: string }>>(
            'SELECT generationId, phase FROM generationState ORDER BY createdAt',
          )
          .toArray(),
        selection: state.storage.sql
          .exec<
            Readonly<{
              activeDeployId: string | null;
              activatingDeployId: string | null;
              lastCleanRequestId: string | null;
            }>
          >(
            'SELECT activeDeployId, activatingDeployId, lastCleanRequestId FROM selection',
          )
          .one(),
      }),
    );
    expect(beforeRestart.deploys).toHaveLength(1);
    expect(beforeRestart.deploys[0]).toMatchObject({
      clean: 1,
      status: 'succeeded',
      workerVersionId: env.WORKER_VERSION_METADATA.id,
    });
    expect(beforeRestart.generations).toEqual([
      {
        phase: 'open',
        generationId: beforeRestart.deploys[0]?.generationId,
      },
    ]);
    expect(beforeRestart.selection).toEqual({
      activeDeployId: beforeRestart.deploys[0]?.id,
      activatingDeployId: null,
      lastCleanRequestId: 'clean-request-production-test',
    });
    expect(seedTestState).toMatchObject({ runs: 1, completions: 1 });

    using systemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_live_production_test',
    });
    expect(
      (await systemApi.hello({ args: [], traceContext: null })).result._tag,
    ).toBe('Right');

    using invalidSystemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_live_wrong',
    });
    expect(
      (
        await invalidSystemApi.hello({
          args: [],
          traceContext: null,
        })
      ).result,
    ).toMatchObject({
      _tag: 'Left',
      left: { code: 'production-api-key-invalid' },
    });

    const authenticationLock = await Effect.runPromise(
      makeAuthenticationLock({ signature: authenticationSignature }),
    );
    using authenticatedApi = await gatewayApi.getAuthenticatedApi({
      publishableKey: 'pk_live_production_test',
      authenticationLock,
      signature: { userId: 'usr_production_socket' },
    });
    expect(
      await Effect.runPromise(
        decodeRpc(await authenticatedApi.getAuthentication()),
      ),
    ).toMatchObject({
      authenticationLock,
      systemId: 'sys_local',
      systemName: system.name,
      systemVersion: system.version,
      userId: 'usr_production_socket',
    });
    const serviceFrontendLock = await Effect.runPromise(
      makeServiceFrontendLock({
        frontend: system.services.app.frontends.products.controller,
      }),
    );
    using serviceFrontendApi = await authenticatedApi.getServiceFrontendApi({
      frontendName: 'products',
      serviceFrontendLock,
      serviceName: 'app',
    });
    expect(
      await Effect.runPromise(
        decodeRpc(await serviceFrontendApi.getAdmission()),
      ),
    ).toMatchObject({
      frontendName: 'products',
      serviceFrontendLock,
      serviceName: 'app',
      systemId: 'sys_local',
      systemVersion: system.version,
      userId: 'usr_production_socket',
    });
    await Effect.runPromise(
      decodeRpc(
        (
          await serviceFrontendApi.getState({
            args: [],
            traceContext: null,
          })
        ).result,
      ),
    );
    const ticketEnvelope = await serviceFrontendApi.createWebSocketTicket({
      args: [],
      traceContext: null,
    });
    const { ticket } = await Effect.runPromise(
      decodeRpc(ticketEnvelope.result),
    );
    const ticketOnlyUrl = new URL(
      'https://production-worker.test/ws-service-frontend-blocks',
    );
    ticketOnlyUrl.searchParams.set('ticket', ticket);
    const ticketOnlyResponse = await SELF.fetch(
      new Request(ticketOnlyUrl, { headers: { Upgrade: 'websocket' } }),
    );
    expect(ticketOnlyResponse.status).toBe(101);

    const replay = await SELF.fetch(
      new Request(ticketOnlyUrl, { headers: { Upgrade: 'websocket' } }),
    );
    expect(replay.status).not.toBe(101);

    const extraParameterEnvelope =
      await serviceFrontendApi.createWebSocketTicket({
        args: [],
        traceContext: null,
      });
    const extraParameterTicket = await Effect.runPromise(
      decodeRpc(extraParameterEnvelope.result),
    );
    const extraParameterUrl = new URL(
      'https://production-worker.test/ws-service-frontend-blocks',
    );
    extraParameterUrl.searchParams.set('ticket', extraParameterTicket.ticket);
    extraParameterUrl.searchParams.set(
      'publishableKey',
      'pk_live_production_test',
    );
    const extraParameterResponse = await SELF.fetch(
      new Request(extraParameterUrl, { headers: { Upgrade: 'websocket' } }),
    );
    expect(extraParameterResponse.status).toBe(400);

    await abortAllDurableObjects();
    const restartedRpcResponse = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(restartedRpcResponse.status).toBe(101);
    restartedRpcResponse.webSocket!.accept();
    using restartedGatewayApi = newWebSocketRpcSession<GatewayApi>(
      restartedRpcResponse.webSocket!,
    );
    using restartedDeployApi =
      await restartedGatewayApi.getProductionDeployApi();
    await Effect.runPromise(decodeRpc(await restartedDeployApi.getReadiness()));
    const afterRestart = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => ({
        deploys: state.storage.sql
          .exec<Readonly<{ id: string }>>('SELECT id FROM deploy')
          .toArray(),
        selection: state.storage.sql
          .exec<
            Readonly<{
              activeDeployId: string | null;
              lastCleanRequestId: string | null;
            }>
          >('SELECT activeDeployId, lastCleanRequestId FROM selection')
          .one(),
      }),
    );
    expect(afterRestart).toEqual({
      deploys: [{ id: beforeRestart.deploys[0]?.id }],
      selection: {
        activeDeployId: beforeRestart.deploys[0]?.id,
        lastCleanRequestId: 'clean-request-production-test',
      },
    });
    expect(seedTestState).toMatchObject({ runs: 1, completions: 1 });
  });

  it('executes all three current-write paths through ProductionWorker-hosted Gateway capabilities', async () => {
    const ingress = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(ingress.status).toBe(101);
    ingress.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(ingress.webSocket!);
    using productionDeployApi = await gatewayApi.getProductionDeployApi();
    await Effect.runPromise(
      decodeRpc(await productionDeployApi.getReadiness()),
    );

    using systemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_live_production_test',
    });
    const aggregateId = makeAggregateId({ id: 'production-worker-ingress' });
    const userId = system.aggregates.user.models.user.prefixId(
      'production-worker-ingress',
    );
    const encodedCreateUser = Schema.decodeUnknownSync(
      EncodedAggregateCommandSchema,
    )({
      aggregateId,
      aggregateName: main.aggregateName,
      commandName: 'createUser',
      commandType: 'aggregate',
      contractVersion: '1.0.0',
      frontendName: null,
      id: 'cmd_production_worker_ingress_create_user',
      payload: await Effect.runPromise(
        system.aggregates.user.contracts.createUser.encodePayload({
          payload: { id: userId, name: 'Production Worker ingress user' },
        }),
      ),
      pushedCursor: null,
      sessionId: null,
      systemName: system.name,
      userId: null,
    });
    const aggregateFinalization = await systemApi.finalizeAggregateCommands({
      args: [
        {
          aggregateId,
          aggregateName: main.aggregateName,
          commands: [encodedCreateUser],
        },
      ],
      traceContext: null,
    });
    expect(
      await Effect.runPromise(decodeRpc(aggregateFinalization.result)),
    ).toMatchObject({
      executedCommands: [{ id: encodedCreateUser.id }],
      failedCommands: [],
    });

    const productId = system.services.app.models.product.prefixId(
      'production-worker-ingress',
    );
    const encodedCreateProduct = Schema.decodeUnknownSync(
      EncodedServiceCommandSchema,
    )({
      commandName: 'createProduct',
      commandType: 'service',
      contractVersion: '1.0.0',
      id: 'cmd_production_worker_ingress_create_product',
      payload: await Effect.runPromise(
        system.services.app.contracts.createProduct.encodePayload({
          payload: {
            id: productId,
            name: 'Production Worker ingress product',
          },
        }),
      ),
      serviceName: 'app',
    });
    const serviceFinalization = await systemApi.finalizeServiceCommands({
      args: [{ commands: [encodedCreateProduct], serviceName: 'app' }],
      traceContext: null,
    });
    expect(
      await Effect.runPromise(decodeRpc(serviceFinalization.result)),
    ).toMatchObject({
      executedCommands: [{ id: encodedCreateProduct.id }],
      failedCommands: [],
    });

    const authenticationLock = await Effect.runPromise(
      makeAuthenticationLock({ signature: authenticationSignature }),
    );
    using authenticatedApi = await gatewayApi.getAuthenticatedApi({
      authenticationLock,
      publishableKey: 'pk_live_production_test',
      signature: { userId },
    });
    const aggregateFrontendLock = await Effect.runPromise(
      makeAggregateFrontendLock({ frontend: main }),
    );
    using aggregateFrontendApi = await authenticatedApi.getAggregateFrontendApi(
      {
        aggregateFrontendLock,
        aggregateId,
        aggregateName: main.aggregateName,
        frontendName: main.frontendName,
      },
    );
    await Effect.runPromise(
      decodeRpc(
        (
          await aggregateFrontendApi.getState({
            args: [],
            traceContext: null,
          })
        ).result,
      ),
    );

    const stagedCommand = Schema.decodeUnknownSync(StagedReplicaCommandSchema)({
      aggregateId,
      aggregateName: main.aggregateName,
      commandName: 'createList',
      commandType: 'frontend',
      contractVersion: '1.0.0',
      frontendName: main.frontendName,
      id: 'cmd_production_worker_ingress_push',
      payload: await Effect.runPromise(
        main.contracts.createList.encodePayload({
          payload: {
            id: system.aggregates.user.models.list.prefixId(
              'production-worker-ingress',
            ),
            name: 'Production Worker ingress list',
            userId,
          },
        }),
      ),
      pushedCursor: null,
      replicaIndex: 1,
      sessionId: 'sesn_production_worker_ingress',
      stagedAt: '2026-08-11T00:00:00.000Z',
      stagedCursor: 'stcur_production_worker_ingress',
      status: 'staged',
      systemName: system.name,
      userId,
    });
    const pushed = await Effect.runPromise(
      decodeRpc(
        (
          await aggregateFrontendApi.pushCommands({
            args: [{ commands: [stagedCommand] }],
            traceContext: null,
          })
        ).result,
      ),
    );
    expect([
      ...pushed.pendingCommands,
      ...pushed.pushedCommands,
      ...pushed.executedCommands,
      ...pushed.failedStagedCommands,
      ...pushed.failedPushedCommands,
    ]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: stagedCommand.id }),
      ]),
    );

    const writes = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) =>
        state.storage.sql
          .exec<
            Readonly<{
              writeIndex: number;
              operation: string;
              result: string | null;
            }>
          >(
            'SELECT writeIndex, operation, result FROM systemWrites ORDER BY writeIndex',
          )
          .toArray(),
    );
    expect(writes).toEqual([
      expect.objectContaining({
        writeIndex: 1,
        operation: 'finalizeAggregateCommands',
        result: expect.any(String),
      }),
      expect.objectContaining({
        writeIndex: 2,
        operation: 'finalizeServiceCommands',
        result: expect.any(String),
      }),
      expect.objectContaining({
        writeIndex: 3,
        operation: 'pushCommands',
        result: expect.any(String),
      }),
    ]);
  });

  it('re-wakes an activating configured deploy and returns its domain error through the capability', async () => {
    seedTestState.defect = 'simulated transient activation interruption';

    const ingress = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(ingress.status).toBe(101);
    ingress.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(ingress.webSocket!);
    using productionDeployApi = await gatewayApi.getProductionDeployApi();
    const firstReadiness = await productionDeployApi.getReadiness();
    expect(firstReadiness).toMatchObject({
      _tag: 'Left',
      left: { code: 'system-deploy-activating' },
    });

    const stored = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => ({
        deploy: state.storage.sql
          .exec<
            Readonly<{
              failure: string | null;
              id: string;
              status: string;
            }>
          >('SELECT id, status, failure FROM deploy')
          .one(),
        selection: state.storage.sql
          .exec<Readonly<{ activatingDeployId: string | null }>>(
            'SELECT activatingDeployId FROM selection',
          )
          .one(),
      }),
    );
    expect(firstReadiness).toMatchObject({
      left: { extra: { deployId: stored.deploy.id } },
    });
    expect(stored).toEqual({
      deploy: {
        failure: null,
        id: stored.deploy.id,
        status: 'activating',
      },
      selection: { activatingDeployId: stored.deploy.id },
    });
    const runsAfterFirstReadiness = seedTestState.runs;
    expect(runsAfterFirstReadiness).toBe(1);

    expect(await productionDeployApi.getReadiness()).toMatchObject({
      _tag: 'Left',
      left: { code: 'system-deploy-activating' },
    });
    expect(seedTestState.runs).toBeGreaterThan(runsAfterFirstReadiness);
    expect(seedTestState.completions).toBe(0);
  });

  it('returns the persisted terminal deployment failure through ProductionDeployApi', async () => {
    seedTestState.failure = 'deterministic production seed rejection';
    const ingress = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(ingress.status).toBe(101);
    ingress.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(ingress.webSocket!);
    using productionDeployApi = await gatewayApi.getProductionDeployApi();
    expect(await productionDeployApi.getReadiness()).toMatchObject({
      _tag: 'Left',
      left: {
        code: 'system-deploy-failed',
        extra: {
          failure: { code: 'generation-seed-evaluation-failed' },
        },
      },
    });
    expect(seedTestState).toMatchObject({ runs: 1, completions: 0 });

    const stored = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) =>
        state.storage.sql
          .exec<Readonly<{ failure: string; status: string }>>(
            'SELECT status, failure FROM deploy',
          )
          .one(),
    );
    expect(stored.status).toBe('failed');
    expect(JSON.parse(stored.failure)).toMatchObject({
      code: 'generation-seed-evaluation-failed',
    });
  });
});
