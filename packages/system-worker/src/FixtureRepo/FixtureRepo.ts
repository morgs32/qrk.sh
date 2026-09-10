import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, ManagedRuntime, Result } from 'effect';
import invariant from 'tiny-invariant';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';

const managedRuntime = ManagedRuntime.make(AsyncLive);

const fixtureRepoTables = {
  fixtureValues: makeTable({
    name: 'fixtureValues',
    shape: {
      scope: primitives.text(),
      id: primitives.text(),
      value: primitives.text(),
    },
    indexes: [
      {
        name: 'fixtureValues_scope_id_unique',
        columns: ['scope', 'id'],
        unique: true,
      },
    ],
  }),
};

const fixtureRepoDbConfig = makeDbConfig({ tables: fixtureRepoTables });

const fixtureFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scope/:id'),
  managedRuntime,
  dbConfig: fixtureRepoDbConfig,
});

export class FixtureRepo extends makeFixedDORepo({
  namespaceBinding: 'FIXTURE_REPO',
  fixedDORepoConfig: fixtureFixedDORepoConfig,
}) {
  /*
   * FixtureRepo.getOpenedName is the runtime boundary for the same-named operation.
   *
   * 1. Validate and return the opened physical name.
   */
  async getOpenedName(): Promise<string> {
    // 1 — require ctx.id.name from getByName
    const name = this.ctx.id.name;
    invariant(name, 'FixtureRepo must be accessed via getByName');
    return name;
  }

  /*
   * FixtureRepo.writeValue is the runtime boundary for the same-named operation.
   *
   * 1. Write the fixture value.
   */
  async writeValue(props: { value: string }): Promise<void> {
    const { value } = props;

    // 1 — use the bound scope and id in fixtureValues
    await this.db
      .insert(this.schema.fixtureValues)
      .values({
        scope: this.key.scope,
        id: this.key.id,
        value,
      })
      .run();
  }

  /** Clears alarms created by direct-effect queue acceptance cases. */
  /*
   * FixtureRepo.alarm is the runtime boundary for the same-named operation.
   *
   * 1. Clear the fixture alarm.
   */
  async alarm(): Promise<void> {
    // 1 — delete the Durable Object alarm
    await this.ctx.storage.deleteAlarm();
  }

  /*
   * FixtureRepo.inspectAsyncTransactionRollback is the runtime boundary for the same-named operation.
   *
   * 1. Open the outer transaction probe.
   * 2. Roll back the nested write.
   * 3. Read state after the nested rollback.
   * 4. Probe rollback of the outer transaction.
   * 5. Return both rollback observations.
   */
  async inspectAsyncTransactionRollback() {
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        // 1 — write outer-committed before entering the nested transaction
        const nested = yield* makeAsyncTx({
          storage: this.ctx.storage,
          program: () =>
            Effect.gen({ self: this }, function* () {
              this.db
                .update(this.schema.fixtureValues)
                .set({ value: 'outer-committed' })
                .where(eq(this.schema.fixtureValues.id, this.key.id))
                .run();

              // 2 — fail fixture-nested-transaction-failure and settle its outcome
              const nestedResult = yield* makeAsyncTx({
                storage: this.ctx.storage,
                program: () =>
                  Effect.gen({ self: this }, function* () {
                    this.db
                      .update(this.schema.fixtureValues)
                      .set({ value: 'nested-rolled-back' })
                      .where(eq(this.schema.fixtureValues.id, this.key.id))
                      .run();
                    return yield* new ZerospinError({
                      code: 'fixture-nested-transaction-failure',
                      message: 'Roll back only the nested transaction',
                    });
                  }),
              }).pipe(Effect.result);

              // 3 — return the outer transaction value and nested failure code
              const row = this.db
                .select({ value: this.schema.fixtureValues.value })
                .from(this.schema.fixtureValues)
                .where(eq(this.schema.fixtureValues.id, this.key.id))
                .get();
              return {
                nestedFailureCode: Result.isFailure(nestedResult)
                  ? nestedResult.failure.code
                  : null,
                valueAfterNestedRollback: row?.value ?? null,
              };
            }),
        });

        // 4 — write outer-rolled-back then fail the outer transaction
        const outerResult = yield* makeAsyncTx({
          storage: this.ctx.storage,
          program: () =>
            Effect.gen({ self: this }, function* () {
              this.db
                .update(this.schema.fixtureValues)
                .set({ value: 'outer-rolled-back' })
                .where(eq(this.schema.fixtureValues.id, this.key.id))
                .run();
              return yield* new ZerospinError({
                code: 'fixture-outer-transaction-failure',
                message: 'Roll back the outer transaction',
              });
            }),
        }).pipe(Effect.result);
        const row = this.db
          .select({ value: this.schema.fixtureValues.value })
          .from(this.schema.fixtureValues)
          .where(eq(this.schema.fixtureValues.id, this.key.id))
          .get();

        // 5 — report nested and outer failure codes with persisted readback
        return {
          ...nested,
          outerFailureCode: Result.isFailure(outerResult)
            ? outerResult.failure.code
            : null,
          valueAfterOuterRollback: row?.value ?? null,
        };
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}

export { managedRuntime };
