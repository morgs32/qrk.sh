import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { AnyRelations } from 'drizzle-orm';
import type { SQLiteTransactionConfig } from 'drizzle-orm/sqlite-core/session';
import { Effect, Runtime } from 'effect';

import type { IAsyncDb, IAsyncTx, IDbConfig } from './types.ts';

const txQueues = new WeakMap<object, Promise<void>>();

export const makeTxAsync = Effect.fn('makeTxAsync')(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
  SUCCESS,
  ERROR extends IAnyError,
  PROGRAM_REQUIREMENTS,
>(props: {
  config?: SQLiteTransactionConfig;
  db: IAsyncDb<IDbConfig<SCHEMA, RELATIONS>>;
  program: (props: {
    tx: IAsyncTx<IDbConfig<SCHEMA, RELATIONS>>;
  }) => Effect.Effect<SUCCESS, ERROR, PROGRAM_REQUIREMENTS>;
}): Effect.fn.Return<SUCCESS, IAnyError, PROGRAM_REQUIREMENTS> {
  const { config, db, program } = props;
  const runtime = yield* Effect.runtime<PROGRAM_REQUIREMENTS>();

  return yield* Effect.tryPromise({
    try: async (): Promise<SUCCESS> => {
      const dbKey = db as object;
      const priorTx = txQueues.get(dbKey) ?? Promise.resolve();
      let releaseCurrentTx!: () => void;
      const currentTx = priorTx.then(
        () =>
          new Promise<void>(resolve => {
            releaseCurrentTx = resolve;
          }),
      );
      txQueues.set(dbKey, currentTx);
      await priorTx;
      try {
        return await db.transaction(
          tx =>
            Runtime.runPromise(runtime)(
              program({
                tx,
              }),
            ),
          config,
        );
      } finally {
        releaseCurrentTx();
        if (txQueues.get(dbKey) === currentTx) {
          txQueues.delete(dbKey);
        }
      }
    },
    catch: error =>
      new ZerospinError({
        code: 'drizzle-transaction-failed',
        message: `Failed to begin database transaction: ${error}`,
        cause: ZerospinError.prettyUnknownFailure(error),
      }),
  });
});
