import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect } from 'effect';
import { system } from 'system';
import { describe, expect, it } from 'vitest';

import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import { systemRepoDbConfig } from '../SystemRepo/systemRepoDbConfig.js';

describe('SystemRepo lookup and activation', () => {
  it('resolves the configured singleton through the shared lookup', async () => {
    const repo = await Effect.runPromise(
      SystemRepo.getRepo({
        key: { systemId: env.ZEROSPIN_SYSTEM_ID },
      }),
    );
    const outcome = await repo.getRepoRegistrations({
      repoType: 'SystemLogRepo',
    });
    expect(outcome._tag).toBe('Success');
  });

  it.each(['invalid-id', 'sys_other'])(
    'rejects %s when the stub activates',
    async systemId => {
      const repo = await Effect.runPromise(
        SystemRepo.getRepo({ key: { systemId } }),
      );
      // The test plugin wraps RPC methods as callable thenables. Await property
      // resolution so constructor failure cannot also reject its invocation queue.
      await expect(Promise.resolve(repo.getRepoRegistrations)).rejects.toThrow(
        'SystemRepo must be addressed by the exact systemId',
      );
    },
  );
});

describe('production Repo spec acceptance guard', () => {
  it('rejects a fresh unaccepted Repo without registering it, then activates after acceptance', async () => {
    const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    const before = await systemRepo.getRepoRegistrations({
      repoType: 'SystemLogRepo',
    });
    await runInDurableObject(systemRepo, instance => {
      instance.db.delete(systemRepoDbConfig.schema.aggregateSpecLocks).run();
      instance.db.delete(systemRepoDbConfig.schema.serviceSpecLocks).run();
    });
    const log = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_unlocked' } }),
    );
    await expect(
      runInDurableObject(log, () => {
        throw new Error('Unaccepted Repo must not serve requests');
      }),
    ).rejects.toThrow('aggregate-spec-not-accepted');
    expect(
      await systemRepo.getRepoRegistrations({ repoType: 'SystemLogRepo' }),
    ).toEqual(before);
    await runInDurableObject(systemRepo, instance => {
      expect(
        instance.db
          .select()
          .from(systemRepoDbConfig.schema.aggregateSpecLocks)
          .all(),
      ).toEqual([]);
      expect(
        instance.db
          .select()
          .from(systemRepoDbConfig.schema.serviceSpecLocks)
          .all(),
      ).toEqual([]);
    });
    expect(
      await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) }),
    ).toEqual({ _tag: 'Success', success: { workerVersionId: null } });
    const retried = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_unlocked' } }),
    );
    expect(await retried.ready()).toEqual({
      _tag: 'Success',
      success: undefined,
    });
    await runInDurableObject(retried, (_instance, state) => {
      expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
    });
    expect(
      await systemRepo.getRepoRegistrations({ repoType: 'SystemLogRepo' }),
    ).toMatchObject({
      _tag: 'Success',
      success: expect.arrayContaining([
        expect.objectContaining({ repoType: 'SystemLogRepo' }),
      ]),
    });
  });

  it('rejects a mismatched bundle before registering a fresh instance', async () => {
    const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    const before = await systemRepo.getRepoRegistrations({
      repoType: 'SystemLogRepo',
    });
    await runInDurableObject(systemRepo, instance => {
      const table = systemRepoDbConfig.schema.aggregateSpecLocks;
      const lock = instance.db.select().from(table).get()!;
      instance.db
        .update(table)
        .set({
          spec: JSON.stringify({
            ...JSON.parse(lock.spec),
            version: 'blocked',
          }),
        })
        .run();
    });
    const log = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_mismatched' } }),
    );
    await expect(
      runInDurableObject(log, () => {
        throw new Error('Mismatched Repo must not serve requests');
      }),
    ).rejects.toThrow('aggregate-spec-mismatch');
    expect(
      await systemRepo.getRepoRegistrations({ repoType: 'SystemLogRepo' }),
    ).toEqual(before);
    // Only disposable test locks are rebuilt; production has no mutation/reset API.
    await runInDurableObject(systemRepo, instance => {
      instance.db.delete(systemRepoDbConfig.schema.aggregateSpecLocks).run();
    });
    expect(
      await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) }),
    ).toEqual({ _tag: 'Success', success: { workerVersionId: null } });
    const retried = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_mismatched' } }),
    );
    expect(await retried.ready()).toEqual({
      _tag: 'Success',
      success: undefined,
    });
  });

  it('checks locked definitions again on a scheduled cold alarm and retains prior registration', async () => {
    const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    const log = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_cold_alarm' } }),
    );
    expect(await log.ready()).toEqual({ _tag: 'Success', success: undefined });
    const registration = await systemRepo.getRepoRegistrations({
      repoType: 'SystemLogRepo',
    });
    await runInDurableObject(log, async (_instance, state) => {
      await state.storage.setAlarm(Date.now() + 60_000);
    });
    await runInDurableObject(systemRepo, instance => {
      instance.db.delete(systemRepoDbConfig.schema.serviceSpecLocks).run();
    });
    await abortAllDurableObjects();
    const reopened = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_cold_alarm' } }),
    );
    await expect(runDurableObjectAlarm(reopened)).rejects.toThrow(
      'service-spec-not-accepted',
    );
    const reopenedSystemRepo = env.SYSTEM_REPO.getByName(
      env.ZEROSPIN_SYSTEM_ID,
    );
    expect(
      await reopenedSystemRepo.getRepoRegistrations({
        repoType: 'SystemLogRepo',
      }),
    ).toEqual(registration);
    expect(
      await reopenedSystemRepo.checkSystemSpec({
        spec: makeSystemSpec({ system }),
      }),
    ).toEqual({ _tag: 'Success', success: { workerVersionId: null } });
    const retried = await Effect.runPromise(
      SystemLogRepo.getRepo({ key: { systemId: 'sys_plan078_cold_alarm' } }),
    );
    expect(await retried.ready()).toEqual({
      _tag: 'Success',
      success: undefined,
    });
    await runInDurableObject(retried, async (_instance, state) => {
      expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
      await state.storage.deleteAlarm();
    });
  });
});
