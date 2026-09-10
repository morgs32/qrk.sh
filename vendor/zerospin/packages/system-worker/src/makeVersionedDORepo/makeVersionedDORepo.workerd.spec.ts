import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { applyVersionedDORepoMigration } from './applyVersionedDORepoMigration/applyVersionedDORepoMigration.js';
import {
  VersionedDORepoFixture,
  versionedDORepoFixtureInvalidMigration,
} from './test/VersionedDORepoFixture.js';

function readAppliedMigrationIds(state: DurableObjectState): number[] {
  return [
    ...state.storage.sql.exec<{ id: number }>(
      'SELECT id FROM applied_migrations ORDER BY id ASC',
    ),
  ].map(row => row.id);
}

function tableHasExtraColumn(state: DurableObjectState): boolean {
  return [
    ...state.storage.sql.exec<{ name: string }>(
      "PRAGMA table_info('versionedDORepoFixtureRows')",
    ),
  ].some(column => column.name === 'extra');
}

describe('makeVersionedDORepo lifecycle', () => {
  it('replays migrations and bootstraps the first activation', async () => {
    const name = 'first-activation/fields';
    const stub = await Effect.runPromise(
      VersionedDORepoFixture.getRepo({
        key: { scenario: 'first-activation', id: 'fields' },
      }),
    );

    expect(VersionedDORepoFixture.versionedDORepoConfig.namePattern).toBe(
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
      expect(instance.env.VERSIONED_DO_REPO_FIXTURE).toBeDefined();
      expect(instance.db).toBeDefined();
      expect(instance.dbConfig).toBeDefined();
      expect(instance.schema).toBe(instance.dbConfig.schema);
      expect(instance.relations).toBe(instance.dbConfig.relations);

      expect(readAppliedMigrationIds(state)).toEqual([1, 2]);
      expect(tableHasExtraColumn(state)).toBe(true);
      expect(
        instance.db
          .select()
          .from(instance.schema.versionedDORepoFixtureRows)
          .all(),
      ).toEqual([
        {
          id: 'vdrf_fields',
          scenario: 'first-activation',
          extra: null,
        },
      ]);
      expect(
        state.storage.kv.get('versionedDORepoFixtureBootstrapAttempts'),
      ).toBe(1);
      expect(
        state.storage.kv.get('versionedDORepoFixtureObservedBootstrapMarkers'),
      ).toEqual([null]);
      expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
    });
  });

  it('skips stamped migrations on a marked cold reopen', async () => {
    const name = 'cold-reopen/marked';
    const stub = env.VERSIONED_DO_REPO_FIXTURE.getByName(name);

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.doRepoInitialization).resolves.toBeUndefined();
      expect(tableHasExtraColumn(state)).toBe(true);
      state.storage.sql.exec(
        'ALTER TABLE versionedDORepoFixtureRows DROP COLUMN extra',
      );
      expect(tableHasExtraColumn(state)).toBe(false);
    });

    await abortAllDurableObjects();

    await runInDurableObject(
      env.VERSIONED_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(instance.doRepoInitialization).resolves.toBeUndefined();

        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
        expect(
          state.storage.kv.get('versionedDORepoFixtureBootstrapAttempts'),
        ).toBe(1);
        expect(readAppliedMigrationIds(state)).toEqual([1, 2]);
        expect(tableHasExtraColumn(state)).toBe(false);
        expect([
          ...state.storage.sql.exec<{ id: string; scenario: string }>(
            'SELECT id, scenario FROM versionedDORepoFixtureRows',
          ),
        ]).toEqual([
          {
            id: 'vdrf_marked',
            scenario: 'cold-reopen',
          },
        ]);
      },
    );
  });

  it('replays an unstamped pending migration on cold reopen', async () => {
    const name = 'pending-replay/resume';
    const stub = env.VERSIONED_DO_REPO_FIXTURE.getByName(name);

    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.doRepoInitialization).resolves.toBeUndefined();
      expect(readAppliedMigrationIds(state)).toEqual([1, 2]);
      expect(tableHasExtraColumn(state)).toBe(true);

      state.storage.sql.exec('DELETE FROM applied_migrations WHERE id = 2');
      state.storage.sql.exec(
        'ALTER TABLE versionedDORepoFixtureRows DROP COLUMN extra',
      );
      expect(readAppliedMigrationIds(state)).toEqual([1]);
      expect(tableHasExtraColumn(state)).toBe(false);
    });

    await abortAllDurableObjects();

    await runInDurableObject(
      env.VERSIONED_DO_REPO_FIXTURE.getByName(name),
      async (instance, state) => {
        await expect(instance.doRepoInitialization).resolves.toBeUndefined();

        expect(readAppliedMigrationIds(state)).toEqual([1, 2]);
        expect(tableHasExtraColumn(state)).toBe(true);
        expect(
          state.storage.kv.get('versionedDORepoFixtureBootstrapAttempts'),
        ).toBe(1);
        expect(state.storage.kv.get('_isBootstrapped')).toBe('true');
        expect(
          instance.db
            .select()
            .from(instance.schema.versionedDORepoFixtureRows)
            .all(),
        ).toEqual([
          {
            id: 'vdrf_resume',
            scenario: 'pending-replay',
            extra: null,
          },
        ]);
      },
    );
  });

  it('does not stamp a failed migration and can retry the same migration', async () => {
    const name = 'fail-migrate/once';
    const stub = env.VERSIONED_DO_REPO_FIXTURE.getByName(name);
    const { managedRuntime } = VersionedDORepoFixture.versionedDORepoConfig;

    /*
     * Migrations are a static list, so the invalid migration is applied via
     * applyVersionedDORepoMigration after a successful boot (same path as
     * initializeSchema). A failure inside blockConcurrencyWhile would break
     * the DO before the test can inspect the ledger.
     */
    await runInDurableObject(stub, async (instance, state) => {
      await expect(instance.doRepoInitialization).resolves.toBeUndefined();
      expect(readAppliedMigrationIds(state)).toEqual([1, 2]);
      expect(tableHasExtraColumn(state)).toBe(true);

      await expect(
        managedRuntime.runPromise(
          applyVersionedDORepoMigration({
            db: instance.db,
            migration: versionedDORepoFixtureInvalidMigration,
          }),
        ),
      ).rejects.toThrow(/Failed to apply migration 3/);
      expect(readAppliedMigrationIds(state)).toEqual([1, 2]);

      await expect(
        managedRuntime.runPromise(
          applyVersionedDORepoMigration({
            db: instance.db,
            migration: versionedDORepoFixtureInvalidMigration,
          }),
        ),
      ).rejects.toThrow(/Failed to apply migration 3/);
      expect(readAppliedMigrationIds(state)).toEqual([1, 2]);
    });
  });
});
