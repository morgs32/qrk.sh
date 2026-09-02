import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Effect, ManagedRuntime } from 'effect';

import { makeFixedDORepo } from '../makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepoConfig.js';

const managedRuntime = ManagedRuntime.make(AsyncLive);

const fixedDORepoFixtureTables = {
  fixedDORepoFixtureRows: makeTable({
    name: 'fixedDORepoFixtureRows',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'fdrf' }),
      scenario: primitives.text(),
    },
    indexes: [
      {
        name: 'fixedDORepoFixtureRows_scenario_idx',
        columns: ['scenario'],
        unique: false,
      },
    ],
  }),
};

const fixedDORepoFixtureDbConfig = makeDbConfig({
  tables: fixedDORepoFixtureTables,
});

const fixedDORepoFixtureConfig = makeFixedDORepoConfig({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scenario/:id'),
  managedRuntime,
  getDbConfig: Effect.fn('FixedDORepoFixture.getDbConfig')(function* () {
    yield* Effect.void;
    return fixedDORepoFixtureDbConfig;
  }),
  bootstrap: Effect.fn('FixedDORepoFixture.bootstrap')(function* (props) {
    const { ctx, db, key, schema } = props;
    const attempt =
      (ctx.storage.kv.get<number>('fixedDORepoFixtureBootstrapAttempts') ?? 0) +
      1;
    const observedMarkers =
      ctx.storage.kv.get<(string | null)[]>(
        'fixedDORepoFixtureObservedBootstrapMarkers',
      ) ?? [];
    const observedMarker =
      ctx.storage.kv.get<string>('_isBootstrapped') ?? null;

    ctx.storage.kv.put('fixedDORepoFixtureBootstrapAttempts', attempt);
    ctx.storage.kv.put('fixedDORepoFixtureObservedBootstrapMarkers', [
      ...observedMarkers,
      observedMarker,
    ]);

    if (key.scenario === 'fail-once' && attempt === 2) {
      ctx.storage.sql.exec('DROP TABLE fixedDORepoFixtureRows');
      yield* makeAsync(() => ctx.storage.sync());
      return yield* new ZerospinError({
        code: 'fixed-do-repo-fixture-bootstrap-failed',
        message:
          'FixedDORepo fixture bootstrap failed on its configured attempt',
      });
    }

    yield* Effect.sync(() =>
      db
        .insert(schema.fixedDORepoFixtureRows)
        .values({
          id: `fdrf_${key.id}`,
          scenario: key.scenario,
        })
        .run(),
    );
  }),
});

export class FixedDORepoFixture extends makeFixedDORepo({
  fixedDORepoConfig: fixedDORepoFixtureConfig,
}) {}
