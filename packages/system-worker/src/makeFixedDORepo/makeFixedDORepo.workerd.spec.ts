import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { FixedDORepoFixture } from './test/FixedDORepoFixture.js';

describe('makeFixedDORepo lifecycle', () => {
  it('provisions and bootstraps the first activation', async () => {
    const name = 'first-activation/fields';
    const stub = env.FIXED_DO_REPO_FIXTURE.getByName(name);

    expect(FixedDORepoFixture.fixedDORepoConfig.namePattern).toBe(
      '/:scenario/:id',
    );

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.fixedDORepoInitialization).resolves.toBeUndefined();

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
    });
  });

  it('skips provisioning and bootstrap on a marked cold reopen', async () => {
    const name = 'cold-reopen/marked';
    const stub = env.FIXED_DO_REPO_FIXTURE.getByName(name);

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.fixedDORepoInitialization).resolves.toBeUndefined();
      state.storage.sql.exec('DROP INDEX fixedDORepoFixtureRows_scenario_idx');
    });

    await abortAllDurableObjects();

    await runInDurableObject(
      env.FIXED_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(
          instance.fixedDORepoInitialization,
        ).resolves.toBeUndefined();

        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
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
        await expect(
          instance.fixedDORepoInitialization,
        ).resolves.toBeUndefined();
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
        await expect(
          instance.fixedDORepoInitialization,
        ).resolves.toBeUndefined();

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
});
