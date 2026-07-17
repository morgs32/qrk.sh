import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { newHttpBatchRpcSession } from 'capnweb';
import {
  abortAllDurableObjects,
  reset,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedTestState } from './devSeeds.fixture';

const RPC_URL = 'https://dev-seeds.test/rpc';
const SYSTEM_WORKER_NAME = 'sys_local:local';

beforeEach(async () => {
  await reset();
  seedTestState.completions = 0;
  seedTestState.failure = '';
  seedTestState.runs = 0;
});

describe('DevZerospinApis ordinary local lifecycle', () => {
  it('creates an empty seedless root and activates it before exposing APIs', async () => {
    // 1. The non-clean Worker still blocks composed APIs on one complete local
    //    deploy lifecycle; only its seed input differs from explicit clean.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    using apis = newHttpBatchRpcSession<ZerospinApis>(RPC_URL);
    using systemApi = await apis.getSystemApi({
      zerospinSecretKey: 'zerospin-dev-test',
    });
    expect(systemApi).toBeDefined();

    // 2. First ordinary startup owns a root generation, but it never evaluates
    //    the configured seed Effect and never writes a clean request receipt.
    const stored = await runInDurableObject(devApis, instance => ({
      active: instance.db
        .select()
        .from(instance.schema.systemInstance)
        .get(),
      deploy: instance.db.select().from(instance.schema.deploy).get(),
      generation: instance.db
        .select()
        .from(instance.schema.generation)
        .get(),
      cleanRequests: instance.db
        .select()
        .from(instance.schema.cleanRequest)
        .all(),
    }));
    if (
      stored.active === undefined ||
      stored.deploy === undefined ||
      stored.generation === undefined
    ) {
      throw new Error('Expected the first ordinary local deployment');
    }

    expect(stored.active).toMatchObject({
      systemWorkerName: SYSTEM_WORKER_NAME,
      activeDeployId: stored.deploy.id,
      activatingDeployId: null,
    });
    expect(stored.deploy).toMatchObject({
      deployIndex: 1,
      prevDeployId: null,
      generationId: stored.generation.id,
      status: 'succeeded',
      phase: 'complete',
    });
    expect(stored.generation).toEqual({
      id: stored.deploy.generationId,
      prevGenerationId: null,
    });
    expect(stored.cleanRequests).toEqual([]);
    expect(seedTestState.runs).toBe(0);
    expect(seedTestState.completions).toBe(0);
  });

  it('creates a new deploy but reuses the active generation for an identical-model reload', async () => {
    // 1. Complete the initial ordinary root.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstReady = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstReady.status).toBe(204);

    // 2. Simulate a new Wrangler code version without changing its SystemSpec.
    const firstDeploy = await runInDurableObject(devApis, instance => {
      const selected = instance.db
        .select()
        .from(instance.schema.deploy)
        .where(eq(instance.schema.deploy.deployIndex, 1))
        .get();
      if (selected === undefined) {
        throw new Error('Expected the first ordinary deploy');
      }
      instance.db
        .update(instance.schema.deploy)
        .set({ workerVersionId: 'worker_version_before_exact_reload' })
        .where(eq(instance.schema.deploy.id, selected.id))
        .run();
      return selected;
    });

    // 3. Exact model compatibility creates an attempt identity but not a data
    //    lineage. No clean receipt or seed evaluation is introduced.
    await abortAllDurableObjects();
    const secondReady = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(secondReady.status, await secondReady.clone().text()).toBe(204);

    const stored = await runInDurableObject(
      env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME),
      instance => ({
        active: instance.db
          .select()
          .from(instance.schema.systemInstance)
          .get(),
        secondDeploy: instance.db
          .select()
          .from(instance.schema.deploy)
          .where(eq(instance.schema.deploy.deployIndex, 2))
          .get(),
        generations: instance.db
          .select()
          .from(instance.schema.generation)
          .all(),
        drainingLogs: instance.db
          .select()
          .from(instance.schema.deployLog)
          .where(eq(instance.schema.deployLog.phase, 'draining'))
          .all(),
      }),
    );
    if (stored.active === undefined || stored.secondDeploy === undefined) {
      throw new Error('Expected the exact-compatible local reload');
    }

    expect(stored.secondDeploy).toMatchObject({
      deployIndex: 2,
      prevDeployId: firstDeploy.id,
      generationId: firstDeploy.generationId,
      status: 'succeeded',
      phase: 'complete',
    });
    expect(stored.active.activeDeployId).toBe(stored.secondDeploy.id);
    expect(stored.generations).toHaveLength(1);
    expect(stored.drainingLogs).toEqual([]);
    expect(seedTestState.runs).toBe(0);
  });

  it('creates and drains into a successor generation for a compatible model-definition change', async () => {
    // 1. Start with one active empty root generation.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstReady = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstReady.status).toBe(204);

    // 2. The current fixture has no Product indexes. Give the persisted prior
    //    definition one non-unique index, so the next code version observes an
    //    allowed index removal. Any encoded model difference requires replay.
    const firstDeploy = await runInDurableObject(devApis, instance => {
      const selected = instance.db
        .select()
        .from(instance.schema.deploy)
        .where(eq(instance.schema.deploy.deployIndex, 1))
        .get();
      if (selected === undefined) {
        throw new Error('Expected the first ordinary deploy');
      }
      const priorSystemSpec = Schema.decodeUnknownSync(
        Schema.parseJson(SystemSpecSchema),
      )(selected.systemSpec);
      const priorAppService = priorSystemSpec.serviceControllers.app;
      if (priorAppService === undefined) {
        throw new Error('Expected the app service definition');
      }
      const priorProduct = priorAppService.models.product;
      if (priorProduct === undefined) {
        throw new Error('Expected the Product model definition');
      }
      priorProduct.indexes = [
        {
          name: 'prior_product_name_idx',
          columns: ['name'],
          unique: false,
        },
      ];
      instance.db
        .update(instance.schema.deploy)
        .set({
          workerVersionId: 'worker_version_before_model_reload',
          systemSpec: Schema.encodeUnknownSync(
            Schema.parseJson(SystemSpecSchema),
          )(priorSystemSpec),
        })
        .where(eq(instance.schema.deploy.id, selected.id))
        .run();
      return {
        ...selected,
        systemSpec: priorSystemSpec,
      };
    });

    // 3. The stable deploy controller and the active source SystemRepo retain
    //    the same accepted prior spec in a real deployment. This test changes
    //    history deliberately, so update both durable copies before reload.
    await runInDurableObject(
      env.SYSTEM_REPO.getByName(`sysrepo_${firstDeploy.generationId}`),
      (_instance, state) => {
        const sourceGeneration = state.storage.sql
          .exec<Readonly<{ generationId: string }>>(
            'SELECT generationId FROM generationState WHERE generationId = ?',
            firstDeploy.generationId,
          )
          .toArray();
        if (sourceGeneration.length !== 1) {
          throw new Error('Expected the active source generation state');
        }
        state.storage.sql.exec(
          'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
          Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
            firstDeploy.systemSpec,
          ),
          firstDeploy.generationId,
        );
      },
    );

    // 4. The reload drains the source, prepares a successor generation, and
    //    publishes only the new deploy after openGeneration succeeds.
    await abortAllDurableObjects();
    const secondReady = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(secondReady.status, await secondReady.clone().text()).toBe(204);

    const stored = await runInDurableObject(
      env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME),
      instance => {
        const secondDeploy = instance.db
          .select()
          .from(instance.schema.deploy)
          .where(eq(instance.schema.deploy.deployIndex, 2))
          .get();
        return {
          active: instance.db
            .select()
            .from(instance.schema.systemInstance)
            .get(),
          secondDeploy,
          secondGeneration:
            secondDeploy === undefined
              ? undefined
              : instance.db
                  .select()
                  .from(instance.schema.generation)
                  .where(
                    eq(
                      instance.schema.generation.id,
                      secondDeploy.generationId,
                    ),
                  )
                  .get(),
          drainingLog:
            secondDeploy === undefined
              ? undefined
              : instance.db
                  .select()
                  .from(instance.schema.deployLog)
                  .where(eq(instance.schema.deployLog.phase, 'draining'))
                  .get(),
        };
      },
    );
    if (
      stored.active === undefined ||
      stored.secondDeploy === undefined ||
      stored.secondGeneration === undefined ||
      stored.drainingLog === undefined
    ) {
      throw new Error('Expected the compatible migrated local reload');
    }

    expect(stored.secondDeploy).toMatchObject({
      deployIndex: 2,
      prevDeployId: firstDeploy.id,
      status: 'succeeded',
      phase: 'complete',
    });
    expect(stored.secondDeploy.generationId).not.toBe(
      firstDeploy.generationId,
    );
    expect(stored.secondGeneration).toEqual({
      id: stored.secondDeploy.generationId,
      prevGenerationId: firstDeploy.generationId,
    });
    expect(stored.drainingLog).toMatchObject({
      deployId: stored.secondDeploy.id,
      generationId: stored.secondDeploy.generationId,
      phase: 'draining',
    });
    expect(stored.active.activeDeployId).toBe(stored.secondDeploy.id);
    expect(seedTestState.runs).toBe(0);
  });

  it('records an incompatible candidate as failed and leaves the prior deploy active', async () => {
    // 1. Establish one active root that must remain available if checking fails.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstReady = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstReady.status).toBe(204);

    // 2. Remove Product.name from the persisted prior definition. The current
    //    code therefore adds a required property without a mutation adapter,
    //    which is a major data-compatibility break in ordinary development.
    const firstDeploy = await runInDurableObject(devApis, instance => {
      const selected = instance.db
        .select()
        .from(instance.schema.deploy)
        .where(eq(instance.schema.deploy.deployIndex, 1))
        .get();
      if (selected === undefined) {
        throw new Error('Expected the first ordinary deploy');
      }
      const priorSystemSpec = Schema.decodeUnknownSync(
        Schema.parseJson(SystemSpecSchema),
      )(selected.systemSpec);
      const priorAppService = priorSystemSpec.serviceControllers.app;
      if (priorAppService === undefined) {
        throw new Error('Expected the app service definition');
      }
      const priorProduct = priorAppService.models.product;
      if (priorProduct === undefined) {
        throw new Error('Expected the Product model definition');
      }
      delete priorProduct.properties.name;
      instance.db
        .update(instance.schema.deploy)
        .set({
          workerVersionId: 'worker_version_before_incompatible_reload',
          systemSpec: Schema.encodeUnknownSync(
            Schema.parseJson(SystemSpecSchema),
          )(priorSystemSpec),
        })
        .where(eq(instance.schema.deploy.id, selected.id))
        .run();
      return selected;
    });

    // 3. Readiness remains closed. The error carries remediation and the stable
    //    active pointer still names the first succeeded deploy.
    await abortAllDurableObjects();
    const response = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(response.status).toBe(500);
    const message = await response.text();
    expect(message).toContain('changed incompatibly');
    expect(message).toContain('mutation adapters');
    expect(message).toContain('--clean');

    const stored = await runInDurableObject(
      env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME),
      instance => ({
        active: instance.db
          .select()
          .from(instance.schema.systemInstance)
          .get(),
        failedDeploy: instance.db
          .select()
          .from(instance.schema.deploy)
          .where(eq(instance.schema.deploy.deployIndex, 2))
          .get(),
        generations: instance.db
          .select()
          .from(instance.schema.generation)
          .all(),
        drainingLogs: instance.db
          .select()
          .from(instance.schema.deployLog)
          .where(eq(instance.schema.deployLog.phase, 'draining'))
          .all(),
      }),
    );
    if (stored.active === undefined || stored.failedDeploy === undefined) {
      throw new Error('Expected the failed compatibility candidate');
    }

    expect(stored.active).toMatchObject({
      activeDeployId: firstDeploy.id,
      activatingDeployId: null,
    });
    expect(stored.failedDeploy).toMatchObject({
      deployIndex: 2,
      prevDeployId: firstDeploy.id,
      status: 'failed',
      phase: 'checking',
    });
    expect(stored.failedDeploy.generationId).not.toBe(
      firstDeploy.generationId,
    );
    expect(stored.failedDeploy.failure).not.toBeNull();
    expect(stored.generations).toHaveLength(2);
    expect(stored.drainingLogs).toEqual([]);
    expect(seedTestState.runs).toBe(0);
  });
});
