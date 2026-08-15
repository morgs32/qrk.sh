import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Either, ManagedRuntime } from 'effect';
import invariant from 'tiny-invariant';

import { makeBoundDORepo } from '../makeBoundDORepo/makeBoundDORepo.js';
import { makeBoundDORepoConfig } from '../makeBoundDORepo/makeBoundDORepoConfig.js';

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

const fixtureBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scope/:id'),
  managedRuntime,
  getDbConfig: Effect.fn('FixtureRepo.getDbConfig')(function* (_props) {
    yield* Effect.void;
    return fixtureRepoDbConfig;
  }),
});

export class FixtureRepo extends makeBoundDORepo({
  boundDORepoConfig: fixtureBoundDORepoConfig,
}) {
  async getOpenedName(): Promise<string> {
    const name = this.ctx.id.name;
    invariant(name, 'FixtureRepo must be accessed via getByName');
    return name;
  }

  async writeValue(props: { value: string }): Promise<void> {
    const { value } = props;
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
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  async inspectAsyncTransactionRollback() {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const nested = yield* makeAsyncTx({
          storage: this.ctx.storage,
          program: () =>
            Effect.gen(this, function* () {
              this.db
                .update(this.schema.fixtureValues)
                .set({ value: 'outer-committed' })
                .where(eq(this.schema.fixtureValues.id, this.key.id))
                .run();
              const nestedResult = yield* makeAsyncTx({
                storage: this.ctx.storage,
                program: () =>
                  Effect.gen(this, function* () {
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
              }).pipe(Effect.either);
              const row = this.db
                .select({ value: this.schema.fixtureValues.value })
                .from(this.schema.fixtureValues)
                .where(eq(this.schema.fixtureValues.id, this.key.id))
                .get();
              return {
                nestedFailureCode: Either.isLeft(nestedResult)
                  ? nestedResult.left.code
                  : null,
                valueAfterNestedRollback: row?.value ?? null,
              };
            }),
        });

        const outerResult = yield* makeAsyncTx({
          storage: this.ctx.storage,
          program: () =>
            Effect.gen(this, function* () {
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
        }).pipe(Effect.either);
        const row = this.db
          .select({ value: this.schema.fixtureValues.value })
          .from(this.schema.fixtureValues)
          .where(eq(this.schema.fixtureValues.id, this.key.id))
          .get();
        return {
          ...nested,
          outerFailureCode: Either.isLeft(outerResult)
            ? outerResult.left.code
            : null,
          valueAfterOuterRollback: row?.value ?? null,
        };
      }).pipe(Effect.provide(AsyncLive)),
    );
  }
}

export { managedRuntime };
