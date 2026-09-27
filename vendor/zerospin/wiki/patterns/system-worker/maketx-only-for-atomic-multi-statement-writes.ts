import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { Context, Effect } from 'effect';

class AuthorizationDb extends Context.Service<AuthorizationDb, IDb>()(
  'AuthorizationDb',
) {
  static readonly Tx = Context.Service<'AuthorizationDb.Tx', ITx>(
    'AuthorizationDb.Tx',
  );
}

/**
 * Use `makeTx` only when multiple Drizzle statements must commit or roll back together.
 *
 * @bad Wrap a single `.insert(...).onConflictDoNothing().run()` in `makeTx`.
 * @bad Wrap read-only `.select(...).all()` in `makeTx`; call `db` directly.
 * @bad Split audit/current-state writes across direct `db` calls when they must stay atomic.
 */
export const rememberAggregate = Effect.fn('Repo.rememberAggregate')(
  function* (props: {
    db: {
      insert: (table: unknown) => {
        values: (row: unknown) => {
          onConflictDoNothing: () => { run: () => void };
        };
      };
    };
    aggregates: unknown;
    aggregateId: string;
  }) {
    const { aggregateId, aggregates, db } = props;

    db.insert(aggregates).values({ aggregateId }).onConflictDoNothing().run();
  },
);

export const recordAuthorization = Effect.fn('Repo.recordAuthorization')(
  function* (props: {
    db: IDb;
    authorizationAttempts: IAnyDrizzleSchema;
    authorizations: IAnyDrizzleSchema;
    attemptRow: Record<string, unknown>;
    authorizationRow: Record<string, unknown>;
  }) {
    const {
      attemptRow,
      authorizationAttempts,
      authorizationRow,
      authorizations,
      db,
    } = props;

    return yield* makeTx(
      'Repo.recordAuthorization.transaction',
      AuthorizationDb,
    )(function* () {
      const tx = yield* AuthorizationDb.Tx;
      tx.insert(authorizationAttempts).values(attemptRow).run();
      tx.insert(authorizations).values(authorizationRow).run();
    })().pipe(Effect.provideService(AuthorizationDb, db));
  },
);
