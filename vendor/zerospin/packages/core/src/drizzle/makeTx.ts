import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Cause, Context, Effect, Exit, Option, type Unify } from 'effect';

import type { Async } from '../async/Async.ts';

import type { IDb, ITx } from './types.ts';

let inTxAlready = false;

/** Define a synchronous transaction program with a database-owned Tx service. */
export function makeTx<
  DB extends Omit<Context.Service.Any, typeof Unify.unifySymbol> & {
    readonly Service: IDb;
    readonly Tx: Context.Service.Any & { readonly Service: ITx };
  },
>(name: string, Db: DB) {
  return function <
    ARGS extends unknown[],
    SUCCESS,
    YIELD extends Effect.Effect<unknown, IAnyError, unknown>,
  >(
    program: ((...args: ARGS) => Generator<YIELD, SUCCESS, unknown>) &
      ([Extract<Effect.Services<YIELD>, Async>] extends [never]
        ? unknown
        : never) &
      ([Extract<SUCCESS, PromiseLike<unknown>>] extends [never]
        ? unknown
        : never),
  ) {
    return Effect.fn(name)(function* (
      ...args: ARGS
    ): Effect.fn.Return<
      SUCCESS,
      IAnyError,
      DB['Identifier'] | Exclude<Effect.Services<YIELD>, DB['Tx']['Identifier']>
    > {
      const db: IDb = yield* Effect.service<DB['Identifier'], DB['Service']>(
        Db,
      );
      const context =
        yield* Effect.context<
          Exclude<Effect.Services<YIELD>, DB['Tx']['Identifier']>
        >();

      return yield* Effect.try({
        try: (): SUCCESS => {
          if (inTxAlready) {
            throw new Error('nested-transaction-not-allowed');
          }
          inTxAlready = true;
          try {
            return db.transaction(tx => {
              const exit = Effect.runSyncExitWith(
                Context.add(context, Db.Tx, tx),
              )(Effect.gen(() => program(...args)));
              if (Exit.isFailure(exit)) {
                // The synchronous runner reports suspension without stopping
                // the fiber. Cancel it before rollback so it cannot resume writes.
                for (const reason of exit.cause.reasons) {
                  if (
                    Cause.isDieReason(reason) &&
                    Cause.isAsyncFiberError(reason.defect)
                  ) {
                    reason.defect.fiber.interruptUnsafe();
                    reason.defect.fiber.currentDispatcher.flush();
                  }
                }
                throw exit;
              }
              return { value: exit.value };
            }).value;
          } finally {
            inTxAlready = false;
          }
        },
        catch: error => {
          if (Exit.isExit(error) && Exit.isFailure(error)) {
            const failure = Cause.findErrorOption(error.cause);
            if (
              Option.isSome(failure) &&
              ZerospinError.isZerospinError(failure.value)
            ) {
              return failure.value;
            }
          }

          return new ZerospinError({
            code: 'drizzle-transaction-failed',
            message: `Failed to begin database transaction: ${error}`,
            cause: ZerospinError.prettyUnknownFailure(error),
          });
        },
      });
    });
  };
}
