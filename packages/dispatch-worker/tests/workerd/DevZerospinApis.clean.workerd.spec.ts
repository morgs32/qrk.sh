import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { newHttpBatchRpcSession } from 'capnweb';
import {
  abortAllDurableObjects,
  reset,
  runInDurableObject,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { seedTestState } from './devSeeds.fixture';

const CLEAN_REQUEST_ID = 'cln_test_clean_request';
const RPC_URL = 'https://dev-seeds.test/rpc';
const SYSTEM_WORKER_NAME = 'sys_local:local';

beforeEach(async () => {
  await reset();
  seedTestState.completions = 0;
  seedTestState.failure = '';
  seedTestState.runs = 0;
});

describe('DevZerospinApis explicit-clean lifecycle', () => {
  it('creates one detached root generation, runs seeds, and activates before exposing APIs', async () => {
    // 1. The local control object is addressed by stable instance identity,
    //    never by a version, deploy, or generation id.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);

    // 2. A composed API is not returned until preparation and activation have
    //    both completed. This exercises the same constructor-owned readiness
    //    promise as the dedicated readiness endpoint.
    using apis = newHttpBatchRpcSession<ZerospinApis>(RPC_URL);
    using systemApi = await apis.getSystemApi({
      zerospinSecretKey: 'zerospin-dev-test',
    });
    expect(systemApi).toBeDefined();
    expect(seedTestState.runs).toBe(1);
    expect(seedTestState.completions).toBe(1);

    // 3. Read the authoritative control rows directly. Each assertion names a
    //    distinct identity or lifecycle invariant instead of inferring state
    //    from a timestamp or from the deploy log.
    const stored = await runInDurableObject(devApis, instance => ({
      instance: instance.db
        .select()
        .from(instance.schema.systemInstance)
        .get(),
      deploy: instance.db.select().from(instance.schema.deploy).get(),
      generation: instance.db
        .select()
        .from(instance.schema.generation)
        .get(),
      cleanRequest: instance.db
        .select()
        .from(instance.schema.cleanRequest)
        .get(),
      logs: instance.db
        .select()
        .from(instance.schema.deployLog)
        .orderBy(asc(instance.schema.deployLog.eventIndex))
        .all(),
    }));
    if (
      stored.instance === undefined ||
      stored.deploy === undefined ||
      stored.generation === undefined ||
      stored.cleanRequest === undefined
    ) {
      throw new Error('Expected complete local clean deployment state');
    }

    expect(stored.instance).toMatchObject({
      systemWorkerName: SYSTEM_WORKER_NAME,
      systemId: 'sys_local',
      instanceId: 'local',
      activeDeployId: stored.deploy.id,
      activatingDeployId: null,
    });
    expect(stored.deploy).toMatchObject({
      deployIndex: 1,
      prevDeployId: null,
      generationId: stored.generation.id,
      status: 'succeeded',
      phase: 'complete',
      failure: null,
    });
    expect(stored.deploy.workerVersionId).toBeTruthy();
    expect(stored.deploy.completedAt).not.toBeNull();
    expect(stored.generation).toEqual({
      id: stored.deploy.generationId,
      prevGenerationId: null,
    });
    expect(stored.cleanRequest).toMatchObject({
      id: CLEAN_REQUEST_ID,
      deployId: stored.deploy.id,
      generationId: stored.generation.id,
    });

    // 4. Logs describe the control lifecycle but do not select the active row.
    //    A clean root intentionally has no draining event.
    expect(stored.logs).toHaveLength(4);
    expect(stored.logs[0]).toMatchObject({
      eventIndex: 1,
      deployId: stored.deploy.id,
      phase: 'checking',
      message: 'Local deploy candidate allocated',
    });
    expect(stored.logs[1]).toMatchObject({
      eventIndex: 2,
      deployId: stored.deploy.id,
      phase: 'preparing',
      message: 'Preparing the selected local generation',
    });
    expect(stored.logs[2]).toMatchObject({
      eventIndex: 3,
      deployId: stored.deploy.id,
      phase: 'activating',
      message: 'Reserved local deploy activation',
    });
    expect(stored.logs[3]).toMatchObject({
      eventIndex: 4,
      deployId: stored.deploy.id,
      phase: 'complete',
      message: 'Local deploy activated',
    });
  });

  it('maps repeated constructors for one Worker version to the same deploy', async () => {
    // 1. Complete the first activation and capture its durable identity.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstReady = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstReady.status).toBe(204);
    const firstDeploy = await runInDurableObject(devApis, instance =>
      instance.db.select().from(instance.schema.deploy).get(),
    );
    if (firstDeploy === undefined) {
      throw new Error('Expected the first local deploy');
    }

    // 2. Recreate every Durable Object while retaining storage. Version
    //    Metadata is unchanged, so readiness must reopen the same mapping.
    await abortAllDurableObjects();
    const secondReady = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(secondReady.status).toBe(204);

    // 3. No second deploy, generation, clean receipt, or seed run was created.
    const stored = await runInDurableObject(
      env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME),
      instance => ({
        deploys: instance.db.select().from(instance.schema.deploy).all(),
        generations: instance.db
          .select()
          .from(instance.schema.generation)
          .all(),
        cleanRequests: instance.db
          .select()
          .from(instance.schema.cleanRequest)
          .all(),
      }),
    );
    expect(stored.deploys).toHaveLength(1);
    expect(stored.deploys[0]?.id).toBe(firstDeploy.id);
    expect(stored.generations).toHaveLength(1);
    expect(stored.cleanRequests).toHaveLength(1);
    expect(seedTestState.runs).toBe(1);
    expect(seedTestState.completions).toBe(1);
  });

  it('consumes one clean request once, then treats a later Worker version as an ordinary compatible reload', async () => {
    // 1. The configured clean request creates and seeds the first root.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstReady = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstReady.status).toBe(204);

    // 2. Workerd exposes one Version Metadata id for this test bundle. Moving
    //    the completed row to a synthetic prior id faithfully simulates the
    //    next Wrangler code version while preserving every control row.
    const firstDeploy = await runInDurableObject(devApis, instance => {
      const selected = instance.db
        .select()
        .from(instance.schema.deploy)
        .where(eq(instance.schema.deploy.deployIndex, 1))
        .get();
      if (selected === undefined) {
        throw new Error('Expected the first local deploy');
      }
      instance.db
        .update(instance.schema.deploy)
        .set({ workerVersionId: 'worker_version_before_reload' })
        .where(eq(instance.schema.deploy.id, selected.id))
        .run();
      return selected;
    });

    // 3. The next constructor sees the durable clean receipt and performs the
    //    ordinary exact-compatibility path. It reuses the active generation.
    await abortAllDurableObjects();
    const secondReady = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(secondReady.status).toBe(204);

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
        cleanRequest: instance.db
          .select()
          .from(instance.schema.cleanRequest)
          .where(eq(instance.schema.cleanRequest.id, CLEAN_REQUEST_ID))
          .get(),
      }),
    );
    if (
      stored.active === undefined ||
      stored.secondDeploy === undefined ||
      stored.cleanRequest === undefined
    ) {
      throw new Error('Expected the compatible reload control state');
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
    expect(stored.cleanRequest).toMatchObject({
      deployId: firstDeploy.id,
      generationId: firstDeploy.generationId,
    });
    expect(seedTestState.runs).toBe(1);
    expect(seedTestState.completions).toBe(1);
  });

  it('retains an older clean generation when a later clean request creates another detached root', async () => {
    // 1. Complete the first explicit clean deployment.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstReady = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstReady.status).toBe(204);

    // 2. A real later CLI process supplies a fresh opaque cleanRequestId.
    //    This test bundle has immutable vars, so rename the persisted first id
    //    to model that prior process and free the configured id for the second.
    const firstDeploy = await runInDurableObject(devApis, instance => {
      const selected = instance.db
        .select()
        .from(instance.schema.deploy)
        .where(eq(instance.schema.deploy.deployIndex, 1))
        .get();
      if (selected === undefined) {
        throw new Error('Expected the first clean deploy');
      }
      instance.db
        .update(instance.schema.deploy)
        .set({ workerVersionId: 'worker_version_first_clean' })
        .where(eq(instance.schema.deploy.id, selected.id))
        .run();
      instance.db
        .update(instance.schema.cleanRequest)
        .set({ id: 'cln_prior_clean_process' })
        .where(eq(instance.schema.cleanRequest.id, CLEAN_REQUEST_ID))
        .run();
      return selected;
    });

    // 3. The second clean skips compatibility/drain, runs seeds again, and
    //    creates a root generation without deleting the first root.
    await abortAllDurableObjects();
    const secondReady = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(secondReady.status).toBe(204);

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
          firstGeneration: instance.db
            .select()
            .from(instance.schema.generation)
            .where(
              eq(instance.schema.generation.id, firstDeploy.generationId),
            )
            .get(),
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
          firstCleanRequest: instance.db
            .select()
            .from(instance.schema.cleanRequest)
            .where(
              eq(
                instance.schema.cleanRequest.id,
                'cln_prior_clean_process',
              ),
            )
            .get(),
          secondCleanRequest: instance.db
            .select()
            .from(instance.schema.cleanRequest)
            .where(eq(instance.schema.cleanRequest.id, CLEAN_REQUEST_ID))
            .get(),
        };
      },
    );
    if (
      stored.active === undefined ||
      stored.secondDeploy === undefined ||
      stored.firstGeneration === undefined ||
      stored.secondGeneration === undefined ||
      stored.firstCleanRequest === undefined ||
      stored.secondCleanRequest === undefined
    ) {
      throw new Error('Expected both detached clean generations');
    }

    expect(stored.secondDeploy.prevDeployId).toBe(firstDeploy.id);
    expect(stored.secondDeploy.generationId).not.toBe(firstDeploy.generationId);
    expect(stored.active.activeDeployId).toBe(stored.secondDeploy.id);
    expect(stored.firstGeneration).toMatchObject({
      id: firstDeploy.generationId,
      prevGenerationId: null,
    });
    expect(stored.secondGeneration).toMatchObject({
      id: stored.secondDeploy.generationId,
      prevGenerationId: null,
    });
    expect(stored.firstCleanRequest).toMatchObject({
      deployId: firstDeploy.id,
      generationId: firstDeploy.generationId,
    });
    expect(stored.secondCleanRequest).toMatchObject({
      deployId: stored.secondDeploy.id,
      generationId: stored.secondDeploy.generationId,
    });
    expect(seedTestState.runs).toBe(2);
    expect(seedTestState.completions).toBe(2);
  });

  it('persists a failed clean candidate and refuses to retry its Worker version', async () => {
    // 1. Seed resolution is part of preparation and fails before activation.
    seedTestState.failure = 'fixture seed Effect failed';
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const firstResponse = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(firstResponse.status).toBe(500);
    expect(await firstResponse.text()).toContain('fixture seed Effect failed');
    expect(seedTestState.runs).toBe(1);
    expect(seedTestState.completions).toBe(0);

    // 2. The failed candidate remains tied to this Worker version. The clean
    //    receipt is consumed, but no activeDeployId is published.
    const firstStored = await runInDurableObject(devApis, instance => ({
      active: instance.db
        .select()
        .from(instance.schema.systemInstance)
        .get(),
      deploy: instance.db.select().from(instance.schema.deploy).get(),
      generation: instance.db
        .select()
        .from(instance.schema.generation)
        .get(),
      cleanRequest: instance.db
        .select()
        .from(instance.schema.cleanRequest)
        .get(),
    }));
    if (
      firstStored.active === undefined ||
      firstStored.deploy === undefined ||
      firstStored.generation === undefined ||
      firstStored.cleanRequest === undefined
    ) {
      throw new Error('Expected durable failed-clean control state');
    }
    expect(firstStored.active).toMatchObject({
      activeDeployId: null,
      activatingDeployId: null,
    });
    expect(firstStored.deploy).toMatchObject({
      status: 'failed',
      phase: 'preparing',
      generationId: firstStored.generation.id,
    });
    expect(firstStored.deploy.completedAt).not.toBeNull();
    expect(firstStored.deploy.failure).not.toBeNull();
    expect(firstStored.cleanRequest).toMatchObject({
      deployId: firstStored.deploy.id,
      generationId: firstStored.generation.id,
    });

    // 3. Reactivation reports the terminal mapping and does not reevaluate the
    //    now-successful seed Effect or allocate a replacement deploy id.
    seedTestState.failure = '';
    await abortAllDurableObjects();
    const secondResponse = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(secondResponse.status).toBe(500);
    expect(await secondResponse.text()).toContain('previously failed');
    expect(seedTestState.runs).toBe(1);
    const deploys = await runInDurableObject(
      env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME),
      instance => instance.db.select().from(instance.schema.deploy).all(),
    );
    expect(deploys).toHaveLength(1);
  });

  it('fails closed instead of replacing an interrupted Worker-version mapping', async () => {
    // 1. Establish one valid deploy, then model a process death by returning
    //    its Worker-version mapping to an in-progress state.
    const devApis = env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME);
    const ready = await devApis.fetch(
      new Request('https://dev-seeds.test/__zerospin/ready'),
    );
    expect(ready.status).toBe(204);
    await runInDurableObject(devApis, instance => {
      const selected = instance.db.select().from(instance.schema.deploy).get();
      if (selected === undefined) {
        throw new Error('Expected the completed local deploy');
      }
      instance.db
        .update(instance.schema.deploy)
        .set({
          status: 'running',
          phase: 'preparing',
          completedAt: null,
        })
        .where(eq(instance.schema.deploy.id, selected.id))
        .run();
    });

    // 2. The next constructor recognizes the same Worker version as
    //    indeterminate. It does not trust it and does not allocate a retry.
    await abortAllDurableObjects();
    const response = await env.DEV_ZEROSPIN_APIS.getByName(
      SYSTEM_WORKER_NAME,
    ).fetch(new Request('https://dev-seeds.test/__zerospin/ready'));
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('interrupted local deploy');
    const deploys = await runInDurableObject(
      env.DEV_ZEROSPIN_APIS.getByName(SYSTEM_WORKER_NAME),
      instance => instance.db.select().from(instance.schema.deploy).all(),
    );
    expect(deploys).toHaveLength(1);
    expect(seedTestState.runs).toBe(1);
  });
});
