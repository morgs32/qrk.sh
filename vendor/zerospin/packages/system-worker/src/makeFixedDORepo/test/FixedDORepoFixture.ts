import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Effect, ManagedRuntime } from 'effect';
import { Server } from 'partyserver';

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
  dbConfig: fixedDORepoFixtureDbConfig,
  /*
   * The fixed-schema lifecycle fixture observes bootstrap attempts and marker
   * visibility through durable storage. Its retained observations let tests inspect
   * activation and bootstrap behavior across failures and restarts.
   *
   * 1. Count bootstrap attempts.
   * 2. Capture marker visibility during bootstrap.
   * 3. Retain the bootstrap observations.
   * 4. Inject the configured bootstrap failure.
   * 5. Write the successful fixture bootstrap row.
   */
  bootstrap: Effect.fn('FixedDORepoFixture.bootstrap')(function* (props) {
    const { ctx, db, key, schema } = props;

    // 1 — read the retained attempt counter and increment it
    const attempt =
      (ctx.storage.kv.get<number>('fixedDORepoFixtureBootstrapAttempts') ?? 0) +
      1;

    // 2 — record _isBootstrapped as observed before successful bootstrap completion
    const observedMarkers =
      ctx.storage.kv.get<(string | null)[]>(
        'fixedDORepoFixtureObservedBootstrapMarkers',
      ) ?? [];
    const observedMarker =
      ctx.storage.kv.get<string>('_isBootstrapped') ?? null;

    // 3 — write the attempt count and append the observed marker
    ctx.storage.kv.put('fixedDORepoFixtureBootstrapAttempts', attempt);
    ctx.storage.kv.put('fixedDORepoFixtureObservedBootstrapMarkers', [
      ...observedMarkers,
      observedMarker,
    ]);

    // 4 — on attempt two, drop the fixture table, sync storage, and return a domain failure
    if (key.scenario === 'fail-once' && attempt === 2) {
      ctx.storage.sql.exec('DROP TABLE fixedDORepoFixtureRows');
      yield* makeAsync(() => ctx.storage.sync());
      return yield* new ZerospinError({
        code: 'fixed-do-repo-fixture-bootstrap-failed',
        message:
          'FixedDORepo fixture bootstrap failed on its configured attempt',
      });
    }

    // 5 — insert the named scenario and ID into the fixture table
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
  namespaceBinding: 'FIXED_DO_REPO_FIXTURE',
  baseClass: class extends Server {
    override onAlarm() {
      this.ctx.storage.kv.put('fixedDORepoFixtureBaseAlarmCalled', true);
    }
  },
  fixedDORepoConfig: fixedDORepoFixtureConfig,
}) {
  readonly #activationField = 'derived-fields-initialized';

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.alarmRegistry.register(
      'fixtureRecovery',
      Effect.sync(() => {
        this.ctx.storage.kv.put(
          'fixedDORepoFixtureAlarmObservedActivation',
          this.ctx.storage.kv.get('fixedDORepoFixtureActivationCompleted'),
        );
        const pending = this.ctx.storage.kv.get('fixedDORepoFixturePending');
        if (pending !== undefined) {
          this.ctx.storage.kv.put('fixedDORepoFixtureRecovered', pending);
          this.ctx.storage.kv.delete('fixedDORepoFixturePending');
        }
      }),
    );
  }

  override onDOActivation() {
    // Access the private field when the hook is invoked, before its Effect runs.
    const activationField = this.#activationField;
    return Effect.gen({ self: this }, function* () {
      const { storage } = this.ctx;
      const attempt =
        (storage.kv.get<number>('fixedDORepoFixtureActivationAttempts') ?? 0) +
        1;
      storage.kv.put('fixedDORepoFixtureActivationAttempts', attempt);
      storage.kv.put('fixedDORepoFixtureActivationField', activationField);
      storage.kv.put(
        'fixedDORepoFixtureActivationBootstrapMarker',
        storage.kv.get('_isBootstrapped'),
      );
      storage.kv.put(
        'fixedDORepoFixtureActivationBootstrapRows',
        this.db.select().from(this.schema.fixedDORepoFixtureRows).all(),
      );
      yield* makeAsync(() => storage.sync());
      if (this.key.scenario === 'activation-fail-once' && attempt === 1) {
        return yield* new ZerospinError({
          code: 'fixed-do-repo-fixture-activation-failed',
          message: 'FixedDORepo fixture activation failed on its first attempt',
        });
      }
      storage.kv.put('fixedDORepoFixtureActivationCompleted', attempt);
    });
  }
}
