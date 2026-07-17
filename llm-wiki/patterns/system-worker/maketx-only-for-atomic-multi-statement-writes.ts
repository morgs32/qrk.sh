import { Effect } from 'effect';

/**
 * Use `makeTx` only when multiple Drizzle statements must commit or roll back together.
 *
 * @bad Wrap a single `.insert(...).onConflictDoNothing().run()` in `makeTx`.
 * @bad Wrap read-only `.select(...).all()` in `makeTx`; call `db` directly.
 * @bad Split audit/current-state writes across direct `db` calls when they must stay atomic.
 */
export const rememberAccount = Effect.fn('Repo.rememberAccount')(
  function* (props: {
    db: {
      insert: (table: unknown) => {
        values: (row: unknown) => {
          onConflictDoNothing: () => { run: () => void };
        };
      };
    };
    accounts: unknown;
    accountId: string;
  }) {
    const { accountId, accounts, db } = props;

    db.insert(accounts).values({ accountId }).onConflictDoNothing().run();
  },
);

export const recordAuthorization = Effect.fn('Repo.recordAuthorization')(
  function* (props: {
    db: unknown;
    authorizationAttempts: unknown;
    authorizations: unknown;
    attemptRow: unknown;
    authorizationRow: unknown;
  }) {
    const {
      attemptRow,
      authorizationAttempts,
      authorizationRow,
      authorizations,
      db,
    } = props;

    return yield* makeTx({
      db,
      program: Effect.fn('Repo.recordAuthorization.transaction')(function* ({
        tx,
      }) {
        tx.insert(authorizationAttempts).values(attemptRow).run();
        tx.insert(authorizations).values(authorizationRow).run();
      }),
    });
  },
);

declare const makeTx: (props: {
  db: unknown;
  program: (props: {
    tx: {
      insert: (table: unknown) => {
        values: (row: unknown) => { run: () => void };
      };
    };
  }) => Effect.Effect<void, unknown, never>;
}) => Effect.Effect<void, unknown, never>;
