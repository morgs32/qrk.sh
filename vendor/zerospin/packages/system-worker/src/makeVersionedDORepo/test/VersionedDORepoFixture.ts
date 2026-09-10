import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';
import { Effect, ManagedRuntime } from 'effect';

import { makeVersionedDORepo } from '../makeVersionedDORepo.js';
import { makeVersionedDORepoConfig } from '../makeVersionedDORepoConfig.js';

const managedRuntime = ManagedRuntime.make(AsyncLive);

const versionedDORepoFixtureTables = {
  versionedDORepoFixtureRows: makeTable({
    name: 'versionedDORepoFixtureRows',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'vdrf' }),
      scenario: primitives.text(),
      extra: primitives.text({ nullable: true }),
    },
  }),
};

const versionedDORepoFixtureDbConfig = makeDbConfig({
  tables: versionedDORepoFixtureTables,
});

const versionedDORepoFixtureMigrations = [
  {
    id: 1,
    name: 'create_versioned_do_repo_fixture_rows',
    sql: [
      `CREATE TABLE versionedDORepoFixtureRows (
  id TEXT PRIMARY KEY NOT NULL,
  scenario TEXT NOT NULL
);`,
    ],
  },
  {
    id: 2,
    name: 'add_extra_column',
    sql: ['ALTER TABLE versionedDORepoFixtureRows ADD COLUMN extra TEXT;'],
  },
];

export const versionedDORepoFixtureInvalidMigration = {
  id: 3,
  name: 'invalid_sql',
  sql: ['ALTER TABLE versionedDORepoFixtureRows ADD COLUMN ;;;'],
};

const versionedDORepoFixtureConfig = makeVersionedDORepoConfig({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scenario/:id'),
  managedRuntime,
  dbConfig: versionedDORepoFixtureDbConfig,
  migrations: versionedDORepoFixtureMigrations,
  /*
   * The versioned-schema lifecycle fixture observes bootstrap attempts and marker
   * visibility through durable storage. Its retained observations let tests inspect
   * activation and bootstrap behavior across failures and restarts.
   *
   * 1. Count bootstrap attempts.
   * 2. Capture marker visibility during bootstrap.
   * 3. Retain the bootstrap observations.
   * 4. Write the successful fixture bootstrap row.
   */
  bootstrap: Effect.fn('VersionedDORepoFixture.bootstrap')(function* (props) {
    const { ctx, db, key, schema } = props;

    // 1 — read the retained attempt counter and increment it
    const attempt =
      (ctx.storage.kv.get<number>('versionedDORepoFixtureBootstrapAttempts') ??
        0) + 1;

    // 2 — record _isBootstrapped as observed before successful bootstrap completion
    const observedMarkers =
      ctx.storage.kv.get<(string | null)[]>(
        'versionedDORepoFixtureObservedBootstrapMarkers',
      ) ?? [];
    const observedMarker =
      ctx.storage.kv.get<string>('_isBootstrapped') ?? null;

    // 3 — write the attempt count and append the observed marker
    ctx.storage.kv.put('versionedDORepoFixtureBootstrapAttempts', attempt);
    ctx.storage.kv.put('versionedDORepoFixtureObservedBootstrapMarkers', [
      ...observedMarkers,
      observedMarker,
    ]);

    // 4 — insert the named scenario and ID into the fixture table
    yield* Effect.sync(() =>
      db
        .insert(schema.versionedDORepoFixtureRows)
        .values({
          id: `vdrf_${key.id}`,
          scenario: key.scenario,
          extra: null,
        })
        .run(),
    );
  }),
});

export class VersionedDORepoFixture extends makeVersionedDORepo({
  namespaceBinding: 'VERSIONED_DO_REPO_FIXTURE',
  versionedDORepoConfig: versionedDORepoFixtureConfig,
}) {}
