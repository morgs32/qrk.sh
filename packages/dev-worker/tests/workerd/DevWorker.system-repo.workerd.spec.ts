import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
  StagedReplicaCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
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

import { seedTestState } from './devSeeds.fixture';

const DeploySnapshotSchema = Schema.Struct({
  activationCheckpoint: Schema.Literal(
    'allocated',
    'generation-prepared',
    'continuous-replay',
    'pre-cut-ready',
    'ownership-cut',
    'source-writes-terminal',
    'fixed-point-drained',
    'final-replay-complete',
  ),
  clean: Schema.Boolean,
  deployId: Schema.String,
  failure: Schema.NullOr(Schema.Unknown),
  generationId: Schema.String,
  status: Schema.Literal('activating', 'succeeded', 'failed'),
  workerVersionId: Schema.String,
});

beforeEach(async () => {
  await reset();
  seedTestState.completions = 0;
  seedTestState.failure = '';
  seedTestState.runs = 0;
});

describe('DevWorker Worker-hosted Gateway deployment lifecycle', () => {
  it('handshakes before activation and preserves deploy validation and environment boundaries', async () => {
    for (const pathname of ['/rpc', '/ordinary-gateway-ingress']) {
      const response = await SELF.fetch(
        new Request(`https://dev-worker.test${pathname}`, {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(response.status).toBe(101);
      response.webSocket!.accept();
      using gatewayApi = newWebSocketRpcSession<GatewayApi>(
        response.webSocket!,
      );
      using productionDeployApi = await gatewayApi.getProductionDeployApi();
      expect(await productionDeployApi.getReadiness()).toMatchObject({
        _tag: 'Left',
        left: {
          code: 'production-deploy-api-unavailable',
          status: 400,
        },
      });
    }

    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(response.status).toBe(101);
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    expect(await devDeployApi.getReadiness()).toMatchObject({
      _tag: 'Left',
      left: { code: 'system-worker-not-active' },
    });

    for (const request of [
      {},
      { clean: 'yes' },
      {
        clean: false,
        deployId: 'dpl_caller',
      },
      {
        clean: false,
        generationId: 'gen_caller',
      },
      {
        clean: false,
        workerVersionId: 'caller',
      },
    ]) {
      const invalid = await Reflect.apply(
        Reflect.get(devDeployApi, 'startDeploy'),
        devDeployApi,
        [request],
      );
      expect(invalid).toMatchObject({
        _tag: 'Left',
        left: { code: 'system-deploy-start-invalid', status: 400 },
      });
    }
    expect(await devDeployApi.getDeploy({ deployId: 'invalid' })).toMatchObject(
      {
        _tag: 'Left',
        left: { code: 'system-deploy-status-request-invalid', status: 400 },
      },
    );
    expect(
      await devDeployApi.getDeploy({ deployId: 'dpl_missing' }),
    ).toMatchObject({
      _tag: 'Left',
      left: { code: 'system-deploy-status-not-found', status: 404 },
    });
  });

  it('dedupes deploy starts, exposes generation-bound APIs, executes all current-write paths, and serves ticket-only sockets', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(response.status).toBe(101);
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();

    const [firstEncoded, repeatedEncoded] = await Promise.all([
      devDeployApi.startDeploy({ clean: false }),
      devDeployApi.startDeploy({ clean: false }),
    ]);
    const first = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(decodeRpc(firstEncoded)),
    );
    const repeated = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(decodeRpc(repeatedEncoded)),
    );
    expect(repeated.deployId).toBe(first.deployId);
    expect(first.workerVersionId).toBe(env.WORKER_VERSION_METADATA.id);

    let firstCompleted = first;
    for (
      let attempt = 0;
      firstCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      firstCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(await devDeployApi.getDeploy({ deployId: first.deployId })),
        ),
      );
    }
    expect(firstCompleted).toMatchObject({
      deployId: first.deployId,
      failure: null,
      status: 'succeeded',
    });

    const idempotent = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(idempotent.deployId).toBe(first.deployId);

    const second = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(second.deployId).toBe(first.deployId);
    expect(second.generationId).toBe(first.generationId);
    let secondCompleted = second;
    for (
      let attempt = 0;
      secondCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      secondCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: second.deployId }),
          ),
        ),
      );
    }
    expect(secondCompleted).toMatchObject({
      deployId: second.deployId,
      failure: null,
      status: 'succeeded',
    });
    await Effect.runPromise(decodeRpc(await devDeployApi.getReadiness()));

    const stored = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => ({
        deploys: state.storage.sql
          .exec<
            Readonly<{
              generationId: string;
              id: string;
              status: string;
            }>
          >('SELECT id, generationId, status FROM deploy ORDER BY startedAt')
          .toArray(),
        generations: state.storage.sql
          .exec<Readonly<{ generationId: string; phase: string }>>(
            'SELECT generationId, phase FROM generationState ORDER BY createdAt',
          )
          .toArray(),
        selection: state.storage.sql
          .exec<
            Readonly<{
              activeDeployId: string | null;
              activatingDeployId: string | null;
            }>
          >('SELECT activeDeployId, activatingDeployId FROM selection')
          .one(),
      }),
    );
    expect(stored.deploys).toHaveLength(1);
    expect(new Set(stored.deploys.map(deploy => deploy.id)).size).toBe(1);
    expect(new Set(stored.deploys.map(deploy => deploy.generationId))).toEqual(
      new Set([first.generationId]),
    );
    expect(stored.generations).toEqual([
      { generationId: first.generationId, phase: 'open' },
    ]);
    expect(stored.selection).toEqual({
      activeDeployId: second.deployId,
      activatingDeployId: null,
    });
    expect(seedTestState).toMatchObject({ runs: 1, completions: 1 });

    using systemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_dev_test',
    });
    expect(
      (await systemApi.hello({ args: [], traceContext: null })).result._tag,
    ).toBe('Right');

    const aggregateId = makeAggregateId({ id: 'dev-worker-ingress' });
    const userId =
      system.aggregates.user.models.user.prefixId('dev-worker-ingress');
    const encodedCreateUser = Schema.decodeUnknownSync(
      EncodedAggregateCommandSchema,
    )({
      aggregateId,
      aggregateName: main.aggregateName,
      commandName: 'createUser',
      commandType: 'aggregate',
      contractVersion: '1.0.0',
      frontendName: null,
      id: 'cmd_dev_worker_ingress_create_user',
      payload: await Effect.runPromise(
        system.aggregates.user.contracts.createUser.encodePayload({
          payload: { id: userId, name: 'Worker ingress user' },
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

    const productId =
      system.services.app.models.product.prefixId('dev-worker-ingress');
    const encodedCreateProduct = Schema.decodeUnknownSync(
      EncodedServiceCommandSchema,
    )({
      commandName: 'createProduct',
      commandType: 'service',
      contractVersion: '1.0.0',
      id: 'cmd_dev_worker_ingress_create_product',
      payload: await Effect.runPromise(
        system.services.app.contracts.createProduct.encodePayload({
          payload: { id: productId, name: 'Worker ingress product' },
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
      publishableKey: 'pk_dev_test',
      signature: { userId },
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
      userId,
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
    expect(
      await Effect.runPromise(
        decodeRpc(await aggregateFrontendApi.getAdmission()),
      ),
    ).toMatchObject({
      actorRef: { aggregateId, aggregateName: main.aggregateName, userId },
      aggregateFrontendLock,
      frontendName: main.frontendName,
      systemId: 'sys_local',
      systemVersion: system.version,
    });
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

    const listPayload = await Effect.runPromise(
      main.contracts.createList.encodePayload({
        payload: {
          id: system.aggregates.user.models.list.prefixId('worker-ingress'),
          name: 'Worker ingress list',
          userId,
        },
      }),
    );
    const stagedCommand = Schema.decodeUnknownSync(StagedReplicaCommandSchema)({
      aggregateId,
      aggregateName: main.aggregateName,
      commandName: 'createList',
      commandType: 'frontend',
      contractVersion: '1.0.0',
      frontendName: main.frontendName,
      id: 'cmd_dev_worker_ingress_push',
      payload: listPayload,
      pushedCursor: null,
      replicaIndex: 1,
      sessionId: 'sesn_dev_worker_ingress',
      stagedAt: '2026-08-11T00:00:00.000Z',
      stagedCursor: 'stcur_dev_worker_ingress',
      status: 'staged',
      systemName: system.name,
      userId,
    });
    const push = await aggregateFrontendApi.pushCommands({
      args: [{ commands: [stagedCommand] }],
      traceContext: null,
    });
    const pushed = await Effect.runPromise(decodeRpc(push.result));
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

    const aggregateTicketEnvelope =
      await aggregateFrontendApi.createWebSocketTicket({
        args: [],
        traceContext: null,
      });
    const aggregateTicket = await Effect.runPromise(
      decodeRpc(aggregateTicketEnvelope.result),
    );
    const aggregateSocketUrl = new URL(
      'https://dev-worker.test/ws-aggregate-frontend-blocks',
    );
    aggregateSocketUrl.searchParams.set('ticket', aggregateTicket.ticket);
    const aggregateSocket = await SELF.fetch(
      new Request(aggregateSocketUrl, { headers: { Upgrade: 'websocket' } }),
    );
    expect(aggregateSocket.status).toBe(101);
    expect(
      (
        await SELF.fetch(
          new Request(aggregateSocketUrl, {
            headers: { Upgrade: 'websocket' },
          }),
        )
      ).status,
    ).toBe(401);

    const aggregateExtraParameterEnvelope =
      await aggregateFrontendApi.createWebSocketTicket({
        args: [],
        traceContext: null,
      });
    const aggregateExtraParameterTicket = await Effect.runPromise(
      decodeRpc(aggregateExtraParameterEnvelope.result),
    );
    const aggregateExtraParameterUrl = new URL(
      'https://dev-worker.test/ws-aggregate-frontend-blocks',
    );
    aggregateExtraParameterUrl.searchParams.set(
      'ticket',
      aggregateExtraParameterTicket.ticket,
    );
    aggregateExtraParameterUrl.searchParams.set(
      'publishableKey',
      'pk_dev_test',
    );
    expect(
      (
        await SELF.fetch(
          new Request(aggregateExtraParameterUrl, {
            headers: { Upgrade: 'websocket' },
          }),
        )
      ).status,
    ).toBe(400);

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
      userId,
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
    const serviceTicketEnvelope =
      await serviceFrontendApi.createWebSocketTicket({
        args: [],
        traceContext: null,
      });
    const serviceTicket = await Effect.runPromise(
      decodeRpc(serviceTicketEnvelope.result),
    );
    const serviceSocketUrl = new URL(
      'https://dev-worker.test/ws-service-frontend-blocks',
    );
    serviceSocketUrl.searchParams.set('ticket', serviceTicket.ticket);
    expect(
      (
        await SELF.fetch(
          new Request(serviceSocketUrl, {
            headers: { Upgrade: 'websocket' },
          }),
        )
      ).status,
    ).toBe(101);

    const systemLogSocket = await SELF.fetch(
      new Request(
        `https://dev-worker.test/ws-system-logs/${second.generationId}`,
        { headers: { Upgrade: 'websocket' } },
      ),
    );
    expect(systemLogSocket.status).toBe(101);
  });

  it('promotes a detached clean root and preserves retired generation metadata', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const initial = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    let initialCompleted = initial;
    for (
      let attempt = 0;
      initialCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      initialCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: initial.deployId }),
          ),
        ),
      );
    }
    expect(initialCompleted.status).toBe('succeeded');

    const clean = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: true })),
      ),
    );
    expect(clean.deployId).not.toBe(initial.deployId);
    expect(clean.generationId).not.toBe(initial.generationId);
    let cleanCompleted = clean;
    for (
      let attempt = 0;
      cleanCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      cleanCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(await devDeployApi.getDeploy({ deployId: clean.deployId })),
        ),
      );
    }
    expect(cleanCompleted.status).toBe('succeeded');

    const stored = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => ({
        generations: state.storage.sql
          .exec<
            Readonly<{
              phase: string;
              generationId: string;
              initialDeployId: string;
              prevGenerationId: string | null;
            }>
          >(
            'SELECT generationId, prevGenerationId, initialDeployId, phase FROM generationState ORDER BY createdAt',
          )
          .toArray(),
        selection: state.storage.sql
          .exec<Readonly<{ activeDeployId: string | null }>>(
            'SELECT activeDeployId FROM selection',
          )
          .one(),
      }),
    );
    expect(stored.generations).toHaveLength(2);
    expect(
      stored.generations.find(
        generation => generation.generationId === initial.generationId,
      ),
    ).toMatchObject({ phase: 'retired' });
    expect(
      stored.generations.find(
        generation => generation.generationId === clean.generationId,
      ),
    ).toMatchObject({
      phase: 'open',
      initialDeployId: clean.deployId,
      prevGenerationId: null,
    });
    expect(stored.selection.activeDeployId).toBe(clean.deployId);

    const repeatedClean = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: true })),
      ),
    );
    expect(repeatedClean.deployId).toBe(clean.deployId);
  });

  it('resumes the same deploy start after SystemRepo eviction', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const allocated = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(allocated.status).toBe('activating');

    await abortAllDurableObjects();

    const restartedResponse = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    restartedResponse.webSocket!.accept();
    using restartedGatewayApi = newWebSocketRpcSession<GatewayApi>(
      restartedResponse.webSocket!,
    );
    using restartedDevDeployApi = await restartedGatewayApi.getDevDeployApi();
    const replayed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await restartedDevDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(replayed.deployId).toBe(allocated.deployId);
    let completed = replayed;
    for (
      let attempt = 0;
      completed.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      completed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await restartedDevDeployApi.getDeploy({
              deployId: allocated.deployId,
            }),
          ),
        ),
      );
    }
    expect(completed).toMatchObject({
      deployId: allocated.deployId,
      failure: null,
      status: 'succeeded',
    });
  });

  it('refuses a non-clean start while another bundle owns an activating deploy', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const initial = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    let completed = initial;
    for (
      let attempt = 0;
      completed.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      completed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: initial.deployId }),
          ),
        ),
      );
    }
    expect(completed.status).toBe('succeeded');

    await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => {
        state.storage.sql.exec(
          'UPDATE deploy SET workerVersionId = ? WHERE id = ?',
          'worker-version-origin',
          initial.deployId,
        );
        state.storage.sql.exec(
          `INSERT INTO deploy (
            id, prevDeployId, generationId, workerVersionId, systemSpec, clean,
            status, activationCheckpoint, failure, startedAt, completedAt
          )
          SELECT ?, id, generationId, ?, systemSpec, 0, 'activating', 'allocated', NULL, ?, NULL
          FROM deploy WHERE id = ?`,
          'dpl_other_bundle_activation',
          'worker-version-other-bundle',
          Date.now(),
          initial.deployId,
        );
        state.storage.sql.exec(
          'UPDATE selection SET activatingDeployId = ?',
          'dpl_other_bundle_activation',
        );
      },
    );

    expect(await devDeployApi.startDeploy({ clean: false })).toMatchObject({
      _tag: 'Left',
      left: {
        code: 'system-deploy-activation-in-progress',
        extra: {
          activatingDeployId: 'dpl_other_bundle_activation',
          activatingWorkerVersionId: 'worker-version-other-bundle',
        },
      },
    });
  });

  it('returns terminal incompatible deploys as successful snapshots and leaves the executing bundle inactive', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const initial = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    let initialCompleted = initial;
    for (
      let attempt = 0;
      initialCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      initialCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: initial.deployId }),
          ),
        ),
      );
    }

    const incompatiblePriorSystemSpec = structuredClone(
      makeSystemSpec({ system }),
    );
    Reflect.deleteProperty(incompatiblePriorSystemSpec.services, 'inventory');
    await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => {
        const encodedPriorSystemSpec = JSON.stringify(
          incompatiblePriorSystemSpec,
        );
        state.storage.sql.exec(
          'UPDATE deploy SET systemSpec = ?, workerVersionId = ? WHERE id = ?',
          encodedPriorSystemSpec,
          'worker-version-incompatible-origin',
          initial.deployId,
        );
        state.storage.sql.exec(
          'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
          encodedPriorSystemSpec,
          initial.generationId,
        );
      },
    );

    const incompatible = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(incompatible).toMatchObject({
      status: 'failed',
      failure: {
        code: 'system-deploy-incompatible',
        extra: { diff: { kind: 'version-under-bumped' } },
      },
    });
    expect(await devDeployApi.getReadiness()).toMatchObject({
      _tag: 'Left',
      left: { code: 'system-worker-not-active' },
    });
  });

  it('creates and promotes a linked successor generation for a compatible authored change', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const initial = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    let initialCompleted = initial;
    for (
      let attempt = 0;
      initialCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      initialCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: initial.deployId }),
          ),
        ),
      );
    }

    const priorSystemSpec = structuredClone(makeSystemSpec({ system }));
    priorSystemSpec.version = '0.0.0';
    Reflect.deleteProperty(priorSystemSpec.services, 'inventory');
    await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => {
        const encodedPriorSystemSpec = JSON.stringify(priorSystemSpec);
        state.storage.sql.exec(
          'UPDATE deploy SET systemSpec = ?, workerVersionId = ? WHERE id = ?',
          encodedPriorSystemSpec,
          'worker-version-linked-origin',
          initial.deployId,
        );
        state.storage.sql.exec(
          'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
          encodedPriorSystemSpec,
          initial.generationId,
        );
      },
    );

    const linked = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(linked.generationId).not.toBe(initial.generationId);
    let linkedCompleted = linked;
    for (
      let attempt = 0;
      linkedCompleted.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      linkedCompleted = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: linked.deployId }),
          ),
        ),
      );
    }
    expect(linkedCompleted.status).toBe('succeeded');

    const generations = await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) =>
        state.storage.sql
          .exec<
            Readonly<{
              phase: string;
              generationId: string;
              prevGenerationId: string | null;
              successorGenerationId: string | null;
            }>
          >(
            'SELECT generationId, prevGenerationId, successorGenerationId, phase FROM generationState ORDER BY createdAt',
          )
          .toArray(),
    );
    expect(
      generations.find(
        generation => generation.generationId === initial.generationId,
      ),
    ).toMatchObject({
      phase: 'retired',
      successorGenerationId: linked.generationId,
    });
    expect(
      generations.find(
        generation => generation.generationId === linked.generationId,
      ),
    ).toMatchObject({
      phase: 'open',
      prevGenerationId: initial.generationId,
    });
  });

  it('persists a deterministic failed snapshot for deploy-start replay', async () => {
    seedTestState.failure = 'deterministic seed rejection';
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const allocated = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    let failed = allocated;
    for (
      let attempt = 0;
      failed.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      failed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: allocated.deployId }),
          ),
        ),
      );
    }
    expect(failed).toMatchObject({
      deployId: allocated.deployId,
      failure: { code: 'generation-seed-evaluation-failed' },
      status: 'failed',
    });

    const repeated = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    expect(repeated.deployId).toBe(allocated.deployId);
    expect(repeated.status).toBe('failed');
    expect(seedTestState).toMatchObject({ runs: 1, completions: 0 });
  });

  it('gates readiness on the executing Worker version', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using devDeployApi = await gatewayApi.getDevDeployApi();
    const deployed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
      await Effect.runPromise(
        decodeRpc(await devDeployApi.startDeploy({ clean: false })),
      ),
    );
    let completed = deployed;
    for (
      let attempt = 0;
      completed.status === 'activating' && attempt < 100;
      attempt += 1
    ) {
      completed = Schema.decodeUnknownSync(DeploySnapshotSchema)(
        await Effect.runPromise(
          decodeRpc(
            await devDeployApi.getDeploy({ deployId: deployed.deployId }),
          ),
        ),
      );
    }
    await Effect.runPromise(decodeRpc(await devDeployApi.getReadiness()));

    await runInDurableObject(
      env.SYSTEM_REPO.getByName('sys_local'),
      (_instance, state) => {
        state.storage.sql.exec(
          'UPDATE deploy SET workerVersionId = ? WHERE id = ?',
          'worker-version-other-bundle',
          deployed.deployId,
        );
      },
    );
    expect(await devDeployApi.getReadiness()).toMatchObject({
      _tag: 'Left',
      left: {
        code: 'system-worker-not-active',
        extra: {
          activeDeployId: deployed.deployId,
          activeWorkerVersionId: 'worker-version-other-bundle',
          executingWorkerVersionId: env.WORKER_VERSION_METADATA.id,
        },
      },
    });
  });
});
