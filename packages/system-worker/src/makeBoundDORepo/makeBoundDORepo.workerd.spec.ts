import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { BoundDORepoFixture } from './test/BoundDORepoFixture.js';

describe('makeBoundDORepo lifecycle', () => {
  it('provisions and bootstraps the first activation', async () => {
    const name = 'first-activation/fields';
    const stub = env.BOUND_DO_REPO_FIXTURE.getByName(name);

    expect(BoundDORepoFixture.boundDORepoConfig.namePattern).toBe(
      '/:scenario/:id',
    );

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.boundDORepoInitialization).resolves.toBeUndefined();

      expect(instance.key).toEqual({
        scenario: 'first-activation',
        id: 'fields',
      });
      expect(instance.ctx).toBe(state);
      expect(instance.ctx.id.name).toBe(name);
      expect(instance.env.TESTING).toBe(true);
      expect(instance.env.BOUND_DO_REPO_FIXTURE).toBeDefined();
      expect(instance.db).toBeDefined();
      expect(instance.dbConfig).toBeDefined();
      expect(instance.schema).toBe(instance.dbConfig.schema);
      expect(instance.relations).toBe(instance.dbConfig.relations);

      const schemaObjects = [
        ...state.storage.sql.exec<{ name: string; type: string }>(
          "SELECT type, name FROM sqlite_master WHERE name IN ('boundDORepoFixtureRows', 'boundDORepoFixtureRows_scenario_idx')",
        ),
      ];
      expect(schemaObjects).toHaveLength(2);
      expect(schemaObjects).toEqual(
        expect.arrayContaining([
          { type: 'table', name: 'boundDORepoFixtureRows' },
          { type: 'index', name: 'boundDORepoFixtureRows_scenario_idx' },
        ]),
      );
      expect(
        instance.db.select().from(instance.schema.boundDORepoFixtureRows).all(),
      ).toEqual([
        {
          id: 'bdrf_fields',
          scenario: 'first-activation',
        },
      ]);
      expect(state.storage.kv.get('boundDORepoFixtureBootstrapAttempts')).toBe(
        1,
      );
      expect(
        state.storage.kv.get('boundDORepoFixtureObservedBootstrapMarkers'),
      ).toEqual([null]);
      expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
    });
  });

  it('skips provisioning and bootstrap on a marked cold reopen', async () => {
    const name = 'cold-reopen/marked';
    const stub = env.BOUND_DO_REPO_FIXTURE.getByName(name);

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.boundDORepoInitialization).resolves.toBeUndefined();
      state.storage.sql.exec('DROP INDEX boundDORepoFixtureRows_scenario_idx');
    });

    await abortAllDurableObjects();

    await runInDurableObject(
      env.BOUND_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(
          instance.boundDORepoInitialization,
        ).resolves.toBeUndefined();

        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
        expect(
          state.storage.kv.get('boundDORepoFixtureBootstrapAttempts'),
        ).toBe(1);
        expect(
          state.storage.kv.get('boundDORepoFixtureObservedBootstrapMarkers'),
        ).toEqual([null]);
        expect(
          instance.db
            .select()
            .from(instance.schema.boundDORepoFixtureRows)
            .all(),
        ).toEqual([
          {
            id: 'bdrf_marked',
            scenario: 'cold-reopen',
          },
        ]);
        expect([
          ...state.storage.sql.exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'boundDORepoFixtureRows_scenario_idx'",
          ),
        ]).toEqual([]);
      },
    );
  });

  it('reruns provisioning and bootstrap after a failed first attempt', async () => {
    const name = 'fail-once/resume';

    await expect(
      runInDurableObject(
        env.BOUND_DO_REPO_FIXTURE.getByName(name),
        async instance => {
          await instance.boundDORepoInitialization;
        },
      ),
    ).rejects.toThrow('bound-do-repo-fixture-bootstrap-failed');

    await abortAllDurableObjects();

    await runInDurableObject(
      env.BOUND_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(
          instance.boundDORepoInitialization,
        ).resolves.toBeUndefined();

        expect(
          state.storage.kv.get('boundDORepoFixtureBootstrapAttempts'),
        ).toBe(2);
        expect(
          state.storage.kv.get('boundDORepoFixtureObservedBootstrapMarkers'),
        ).toEqual([null, null]);
        expect(
          instance.db
            .select()
            .from(instance.schema.boundDORepoFixtureRows)
            .all(),
        ).toEqual([
          {
            id: 'bdrf_resume',
            scenario: 'fail-once',
          },
        ]);

        const schemaObjects = [
          ...state.storage.sql.exec<{ name: string; type: string }>(
            "SELECT type, name FROM sqlite_master WHERE name IN ('boundDORepoFixtureRows', 'boundDORepoFixtureRows_scenario_idx')",
          ),
        ];
        expect(schemaObjects).toHaveLength(2);
        expect(schemaObjects).toEqual(
          expect.arrayContaining([
            { type: 'table', name: 'boundDORepoFixtureRows' },
            { type: 'index', name: 'boundDORepoFixtureRows_scenario_idx' },
          ]),
        );
        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
      },
    );
  });
});
