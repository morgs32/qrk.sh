import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { FixedDORepoFixture } from './test/FixedDORepoFixture.js';

describe('makeFixedDORepo lifecycle', () => {
  it('rejects inherited alarm failures after sibling recovery completes', async () => {
    const stub = env.FIXED_DO_REPO_FIXTURE.getByName(
      'alarm-rejection/dispatch',
    );
    await runInDurableObject(stub, async (instance, state) => {
      instance.alarmRegistry.register(
        'failure',
        Effect.die(new Error('alarm-dispatch-defect')),
      );
      await expect(instance.alarm()).rejects.toThrow('alarm-dispatch-defect');
      expect(
        state.storage.kv.get('fixedDORepoFixtureAlarmObservedActivation'),
      ).toBe(1);
      expect(state.storage.kv.get('fixedDORepoFixtureBaseAlarmCalled')).toBe(
        true,
      );
    });
  });

  it('provisions and bootstraps the first activation', async () => {
    const name = 'first-activation/fields';
    const stub = await Effect.runPromise(
      FixedDORepoFixture.getRepo({
        key: { scenario: 'first-activation', id: 'fields' },
      }),
    );

    expect(FixedDORepoFixture.fixedDORepoConfig.namePattern).toBe(
      '/:scenario/:id',
    );

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.doRepoInitialization).resolves.toBeUndefined();

      expect(instance.key).toEqual({
        scenario: 'first-activation',
        id: 'fields',
      });
      expect(instance.ctx).toBe(state);
      expect(instance.ctx.id.name).toBe(name);
      expect(instance.env.FIXED_DO_REPO_FIXTURE).toBeDefined();
      expect(instance.db).toBeDefined();
      expect(instance.dbConfig).toBeDefined();
      expect(instance.schema).toBe(instance.dbConfig.schema);
      expect(instance.relations).toBe(instance.dbConfig.relations);

      const schemaObjects = [
        ...state.storage.sql.exec<{ name: string; type: string }>(
          "SELECT type, name FROM sqlite_master WHERE name IN ('fixedDORepoFixtureRows', 'fixedDORepoFixtureRows_scenario_idx')",
        ),
      ];
      expect(schemaObjects).toHaveLength(2);
      expect(schemaObjects).toEqual(
        expect.arrayContaining([
          { type: 'table', name: 'fixedDORepoFixtureRows' },
          { type: 'index', name: 'fixedDORepoFixtureRows_scenario_idx' },
        ]),
      );
      expect(
        instance.db.select().from(instance.schema.fixedDORepoFixtureRows).all(),
      ).toEqual([
        {
          id: 'fdrf_fields',
          scenario: 'first-activation',
        },
      ]);
      expect(state.storage.kv.get('fixedDORepoFixtureBootstrapAttempts')).toBe(
        1,
      );
      expect(
        state.storage.kv.get('fixedDORepoFixtureObservedBootstrapMarkers'),
      ).toEqual([null]);
      expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
      expect(state.storage.kv.get('fixedDORepoFixtureActivationAttempts')).toBe(
        1,
      );
      expect(
        state.storage.kv.get('fixedDORepoFixtureActivationCompleted'),
      ).toBe(1);
      expect(state.storage.kv.get('fixedDORepoFixtureActivationField')).toBe(
        'derived-fields-initialized',
      );
      expect(
        state.storage.kv.get('fixedDORepoFixtureActivationBootstrapMarker'),
      ).toBe('true');
      expect(
        state.storage.kv.get('fixedDORepoFixtureActivationBootstrapRows'),
      ).toEqual([{ id: 'fdrf_fields', scenario: 'first-activation' }]);
    });
  });

  it('skips provisioning and bootstrap on a marked cold reopen', async () => {
    const name = 'cold-reopen/marked';
    const stub = env.FIXED_DO_REPO_FIXTURE.getByName(name);

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.doRepoInitialization).resolves.toBeUndefined();
      state.storage.sql.exec('DROP INDEX fixedDORepoFixtureRows_scenario_idx');
    });

    await abortAllDurableObjects();

    await runInDurableObject(
      env.FIXED_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(instance.doRepoInitialization).resolves.toBeUndefined();

        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
        expect(
          state.storage.kv.get('fixedDORepoFixtureActivationAttempts'),
        ).toBe(2);
        expect(
          state.storage.kv.get('fixedDORepoFixtureActivationCompleted'),
        ).toBe(2);
        expect(
          state.storage.kv.get('fixedDORepoFixtureBootstrapAttempts'),
        ).toBe(1);
        expect(
          state.storage.kv.get('fixedDORepoFixtureObservedBootstrapMarkers'),
        ).toEqual([null]);
        expect(
          instance.db
            .select()
            .from(instance.schema.fixedDORepoFixtureRows)
            .all(),
        ).toEqual([
          {
            id: 'fdrf_marked',
            scenario: 'cold-reopen',
          },
        ]);
        expect([
          ...state.storage.sql.exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'fixedDORepoFixtureRows_scenario_idx'",
          ),
        ]).toEqual([]);
      },
    );
  });

  it('reruns provisioning and bootstrap after a failed attempt', async () => {
    const name = 'fail-once/resume';

    await runInDurableObject(
      env.FIXED_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(instance.doRepoInitialization).resolves.toBeUndefined();
        state.storage.kv.delete('_isBootstrapped');

        await expect(
          FixedDORepoFixture.fixedDORepoConfig.managedRuntime.runPromise(
            FixedDORepoFixture.fixedDORepoConfig.bootstrap({
              ctx: state,
              name,
              key: instance.key,
              db: instance.db,
              dbConfig: instance.dbConfig,
              schema: instance.schema,
              relations: instance.relations,
            }),
          ),
        ).rejects.toThrow('fixed-do-repo-fixture-bootstrap-failed');
        expect(state.storage.kv.get('_isBootstrapped')).toBeUndefined();
      },
    );

    await abortAllDurableObjects();

    await runInDurableObject(
      env.FIXED_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(instance.doRepoInitialization).resolves.toBeUndefined();

        expect(
          state.storage.kv.get('fixedDORepoFixtureBootstrapAttempts'),
        ).toBe(3);
        expect(
          state.storage.kv.get('fixedDORepoFixtureObservedBootstrapMarkers'),
        ).toEqual([null, null, null]);
        expect(
          instance.db
            .select()
            .from(instance.schema.fixedDORepoFixtureRows)
            .all(),
        ).toEqual([
          {
            id: 'fdrf_resume',
            scenario: 'fail-once',
          },
        ]);

        const schemaObjects = [
          ...state.storage.sql.exec<{ name: string; type: string }>(
            "SELECT type, name FROM sqlite_master WHERE name IN ('fixedDORepoFixtureRows', 'fixedDORepoFixtureRows_scenario_idx')",
          ),
        ];
        expect(schemaObjects).toHaveLength(2);
        expect(schemaObjects).toEqual(
          expect.arrayContaining([
            { type: 'table', name: 'fixedDORepoFixtureRows' },
            { type: 'index', name: 'fixedDORepoFixtureRows_scenario_idx' },
          ]),
        );
        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
      },
    );
  });

  it('rejects activation failure and retries the hook without repeating successful bootstrap', async () => {
    const name = 'activation-fail-once/retry';
    // Use the test fetch entrypoint: the plugin's dynamic RPC-property wrapper
    // leaks an extra rejection when a constructor gate fails.
    await expect(
      runInDurableObject(env.FIXED_DO_REPO_FIXTURE.getByName(name), () => {
        throw new Error('RPC must not enter an object whose activation failed');
      }),
    ).rejects.toThrow('fixed-do-repo-fixture-activation-failed');

    const stub = env.FIXED_DO_REPO_FIXTURE.getByName(name);
    expect(await stub.ready()).toEqual({ _tag: 'Success', success: undefined });
    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.doRepoInitialization).resolves.toBeUndefined();
      expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
      expect(state.storage.kv.get('fixedDORepoFixtureBootstrapAttempts')).toBe(
        1,
      );
      expect(state.storage.kv.get('fixedDORepoFixtureActivationAttempts')).toBe(
        2,
      );
      expect(
        state.storage.kv.get('fixedDORepoFixtureActivationCompleted'),
      ).toBe(2);
    });
  });

  it('gates incoming readiness, inspection, and cold alarms on activation', async () => {
    const name = 'incoming-events/readiness';
    const stub = env.FIXED_DO_REPO_FIXTURE.getByName(name);
    const [ready, rows] = await Promise.all([
      stub.ready(),
      stub.getRepoTableRows({ tableName: 'fixedDORepoFixtureRows' }),
    ]);
    expect(ready).toEqual({ _tag: 'Success', success: undefined });
    expect(rows._tag).toBe('Success');
    await runInDurableObject(stub, async (_instance, state) => {
      expect(
        state.storage.kv.get('fixedDORepoFixtureActivationCompleted'),
      ).toBe(1);
      expect(
        state.storage.kv.get('fixedDORepoFixtureAlarmObservedActivation'),
      ).toBeUndefined();
      expect(
        state.storage.kv.get('fixedDORepoFixtureBaseAlarmCalled'),
      ).toBeUndefined();
      state.storage.kv.put('fixedDORepoFixturePending', 'resume-after-restart');
      await state.storage.setAlarm(Date.now() + 60_000);
    });

    await abortAllDurableObjects();
    const reopened = env.FIXED_DO_REPO_FIXTURE.getByName(name);
    expect(await runDurableObjectAlarm(reopened)).toBe(true);
    await runInDurableObject(reopened, async (_instance, state) => {
      expect(state.storage.kv.get('fixedDORepoFixtureActivationAttempts')).toBe(
        2,
      );
      expect(
        state.storage.kv.get('fixedDORepoFixtureAlarmObservedActivation'),
      ).toBe(2);
      expect(state.storage.kv.get('fixedDORepoFixtureBaseAlarmCalled')).toBe(
        true,
      );
      expect(state.storage.kv.get('fixedDORepoFixtureRecovered')).toBe(
        'resume-after-restart',
      );
      expect(state.storage.kv.get('fixedDORepoFixturePending')).toBeUndefined();
    });
  });
});
