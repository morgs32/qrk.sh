import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';
import { Effect, ManagedRuntime } from 'effect';
import { makeMigratableDORepo } from 'system-worker/makeMigratableDORepo/makeMigratableDORepo';
import { makeMigratableDORepoConfig } from 'system-worker/makeMigratableDORepo/makeMigratableDORepoConfig';

const managedRuntime = ManagedRuntime.make(AsyncLive);

const migratableDORepoFixtureTables = {
  migratableDORepoFixtureRows: makeTable({
    name: 'migratableDORepoFixtureRows',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'vdrf' }),
      scenario: primitives.text(),
      extra: primitives.text({ nullable: true }),
    },
  }),
};

const migratableDORepoFixtureDbConfig = makeDbConfig({
  tables: migratableDORepoFixtureTables,
});

const migratableDORepoFixtureMigrations = [
  {
    id: 1,
    name: 'create_migratable_do_repo_fixture_rows',
    sql: [
      `CREATE TABLE migratableDORepoFixtureRows (
  id TEXT PRIMARY KEY NOT NULL,
  scenario TEXT NOT NULL
);`,
    ],
  },
  {
    id: 2,
    name: 'add_extra_column',
    sql: ['ALTER TABLE migratableDORepoFixtureRows ADD COLUMN extra TEXT;'],
  },
];

export const migratableDORepoFixtureInvalidMigration = {
  id: 3,
  name: 'invalid_sql',
  sql: ['ALTER TABLE migratableDORepoFixtureRows ADD COLUMN ;;;'],
};

const migratableDORepoFixtureConfig = makeMigratableDORepoConfig({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scenario/:id'),
  managedRuntime,
  dbConfig: migratableDORepoFixtureDbConfig,
  migrations: migratableDORepoFixtureMigrations,
  /*
   * The migratable-schema lifecycle fixture observes bootstrap attempts and marker
   * visibility through durable storage. Its retained observations let tests inspect
   * activation and bootstrap behavior across failures and restarts.
   *
   * 1. Count bootstrap attempts.
   * 2. Capture marker visibility during bootstrap.
   * 3. Retain the bootstrap observations.
   * 4. Write the successful fixture bootstrap row.
   */
  bootstrap: Effect.fn('MigratableDORepoFixture.bootstrap')(function* (props) {
    const { ctx, db, key, schema } = props;

    // 1 — read the retained attempt counter and increment it
    const attempt =
      (ctx.storage.kv.get<number>('migratableDORepoFixtureBootstrapAttempts') ??
        0) + 1;

    // 2 — record _isBootstrapped as observed before successful bootstrap completion
    const observedMarkers =
      ctx.storage.kv.get<(string | null)[]>(
        'migratableDORepoFixtureObservedBootstrapMarkers',
      ) ?? [];
    const observedMarker =
      ctx.storage.kv.get<string>('_isBootstrapped') ?? null;

    // 3 — write the attempt count and append the observed marker
    ctx.storage.kv.put('migratableDORepoFixtureBootstrapAttempts', attempt);
    ctx.storage.kv.put('migratableDORepoFixtureObservedBootstrapMarkers', [
      ...observedMarkers,
      observedMarker,
    ]);

    // 4 — insert the named scenario and ID into the fixture table
    yield* Effect.sync(() =>
      db
        .insert(schema.migratableDORepoFixtureRows)
        .values({
          id: `vdrf_${key.id}`,
          scenario: key.scenario,
          extra: null,
        })
        .run(),
    );
  }),
});

export class MigratableDORepoFixture extends makeMigratableDORepo({
  namespaceBinding: 'VERSIONED_DO_REPO_FIXTURE',
  migratableDORepoConfig: migratableDORepoFixtureConfig,
}) {}
