import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { ZerospinError } from '@zerospin/error';
import { Effect, ManagedRuntime } from 'effect';

import { makeBoundDORepo } from '../makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepoConfig.js';

const managedRuntime = ManagedRuntime.make(AsyncLive);

const boundDORepoFixtureTables = {
  boundDORepoFixtureRows: makeTable({
    name: 'boundDORepoFixtureRows',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'bdrf' }),
      scenario: primitives.text(),
    },
    indexes: [
      {
        name: 'boundDORepoFixtureRows_scenario_idx',
        columns: ['scenario'],
        unique: false,
      },
    ],
  }),
};

const boundDORepoFixtureDbConfig = makeDbConfig({
  tables: boundDORepoFixtureTables,
});

const boundDORepoFixtureConfig = makeBoundDORepoConfig({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scenario/:id'),
  managedRuntime,
  getDbConfig: Effect.fn('BoundDORepoFixture.getDbConfig')(function* () {
    yield* Effect.void;
    return boundDORepoFixtureDbConfig;
  }),
  bootstrap: Effect.fn('BoundDORepoFixture.bootstrap')(function* (props) {
    const { ctx, db, key, schema } = props;
    const attempt =
      (ctx.storage.kv.get<number>('boundDORepoFixtureBootstrapAttempts') ?? 0) +
      1;
    const observedMarkers =
      ctx.storage.kv.get<(string | null)[]>(
        'boundDORepoFixtureObservedBootstrapMarkers',
      ) ?? [];
    const observedMarker =
      ctx.storage.kv.get<string>('_isBootstrapped') ?? null;

    ctx.storage.kv.put('boundDORepoFixtureBootstrapAttempts', attempt);
    ctx.storage.kv.put('boundDORepoFixtureObservedBootstrapMarkers', [
      ...observedMarkers,
      observedMarker,
    ]);

    if (key.scenario === 'fail-once' && attempt === 1) {
      ctx.storage.sql.exec('DROP TABLE boundDORepoFixtureRows');
      yield* makeAsync(() => ctx.storage.sync());
      return yield* new ZerospinError({
        code: 'bound-do-repo-fixture-bootstrap-failed',
        message: 'BoundDORepo fixture bootstrap failed on its first attempt',
      });
    }

    yield* Effect.sync(() =>
      db
        .insert(schema.boundDORepoFixtureRows)
        .values({
          id: `bdrf_${key.id}`,
          scenario: key.scenario,
        })
        .run(),
    );
  }),
});

export class BoundDORepoFixture extends makeBoundDORepo({
  boundDORepoConfig: boundDORepoFixtureConfig,
}) {}
