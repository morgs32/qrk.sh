import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { env, runInDurableObject } from 'cloudflare:test';
import { system } from 'system';
import { describe, expect, it } from 'vitest';

import { SystemRepo } from './SystemRepo.js';

describe('locked version table migration', () => {
  it('provisions fresh storage and accepts definitions after repeated initialization', async () => {
    const repo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    await runInDurableObject(repo, async (_instance, state) => {
      await state.storage.deleteAll();
      for (let attempt = 0; attempt < 2; attempt++) {
        const reopened = new SystemRepo(state, env);
        await reopened.doRepoInitialization;
        expect(
          state.storage.sql
            .exec(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'locked%Versions' ORDER BY name",
            )
            .toArray(),
        ).toEqual([
          { name: 'lockedAggregateVersions' },
          { name: 'lockedServiceVersions' },
        ]);
        expect(
          await reopened.checkSystemSpec({ spec: makeSystemSpec({ system }) }),
        ).toMatchObject({ _tag: 'Success' });
      }
    });
  });

  it('preserves rows and uniqueness across migration and repeated initialization', async () => {
    const repo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    await runInDurableObject(repo, async (_instance, state) => {
      const before = ['lockedAggregateVersions', 'lockedServiceVersions'].map(
        name =>
          state.storage.sql
            .exec(`SELECT * FROM "${name}" ORDER BY name, version`)
            .toArray(),
      );
      for (const [oldName, newName] of [
        ['aggregateSpecLocks', 'lockedAggregateVersions'],
        ['serviceSpecLocks', 'lockedServiceVersions'],
      ]) {
        state.storage.sql.exec(
          `ALTER TABLE "${newName}" RENAME TO "${oldName}"`,
        );
        state.storage.sql.exec(`DROP INDEX "${newName}_name_version_unique"`);
        state.storage.sql.exec(
          `CREATE UNIQUE INDEX "${oldName}_name_version_unique" ON "${oldName}" (name, version)`,
        );
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const reopened = new SystemRepo(state, env);
        await reopened.doRepoInitialization;
        expect(
          ['lockedAggregateVersions', 'lockedServiceVersions'].map(name =>
            state.storage.sql
              .exec(`SELECT * FROM "${name}" ORDER BY name, version`)
              .toArray(),
          ),
        ).toEqual(before);
        for (const name of [
          'lockedAggregateVersions',
          'lockedServiceVersions',
        ]) {
          expect(() =>
            state.storage.sql.exec(
              `INSERT INTO "${name}" SELECT * FROM "${name}" LIMIT 1`,
            ),
          ).toThrow();
          expect(
            state.storage.sql.exec(`PRAGMA index_list("${name}")`).toArray(),
          ).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: `${name}_name_version_unique`,
                unique: 1,
              }),
            ]),
          );
        }
      }
    });
    const spec = makeSystemSpec({ system });
    const aggregate = Object.values(spec.aggregates).flatMap(Object.values)[0]!;
    const result = await repo.checkSystemSpec({
      spec: {
        ...spec,
        aggregates: {
          ...spec.aggregates,
          [aggregate.name]: {
            [aggregate.version]: {
              ...aggregate,
              selections: {
                ...aggregate.selections,
                changed: { modelName: 'changed' },
              },
            },
          },
        },
      },
    });
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        code: 'aggregate-spec-mismatch',
        extra: { changes: expect.any(Array) },
      },
    });
  });

  it('rolls back both renames when old and new tables coexist', async () => {
    const repo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    await runInDurableObject(repo, (_instance, state) => {
      state.storage.sql.exec(
        'ALTER TABLE lockedAggregateVersions RENAME TO aggregateSpecLocks',
      );
      state.storage.sql.exec(
        'DROP INDEX lockedAggregateVersions_name_version_unique',
      );
      state.storage.sql.exec(
        'CREATE UNIQUE INDEX aggregateSpecLocks_name_version_unique ON aggregateSpecLocks (name, version)',
      );
      state.storage.sql.exec(
        'CREATE TABLE serviceSpecLocks (name TEXT, version TEXT, spec TEXT)',
      );
      try {
        expect(() => new SystemRepo(state, env)).toThrow(
          'both serviceSpecLocks and lockedServiceVersions exist',
        );
        expect(
          state.storage.sql
            .exec(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('aggregateSpecLocks', 'lockedAggregateVersions')",
            )
            .toArray(),
        ).toEqual([{ name: 'aggregateSpecLocks' }]);
        expect(
          state.storage.sql
            .exec(
              "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'aggregateSpecLocks_name_version_unique'",
            )
            .toArray(),
        ).toHaveLength(1);
      } finally {
        state.storage.sql.exec('DROP TABLE serviceSpecLocks');
        state.storage.sql.exec(
          'ALTER TABLE aggregateSpecLocks RENAME TO lockedAggregateVersions',
        );
        state.storage.sql.exec(
          'DROP INDEX aggregateSpecLocks_name_version_unique',
        );
        state.storage.sql.exec(
          'CREATE UNIQUE INDEX lockedAggregateVersions_name_version_unique ON lockedAggregateVersions (name, version)',
        );
      }
    });
  });
});
