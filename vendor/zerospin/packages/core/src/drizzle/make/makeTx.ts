import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import { Cause, Effect, Exit, Option } from 'effect';

import type { Async } from '../../async/Async.ts';
import type { IDb, IDbConfig, ITx } from '../types.ts';

let inTxAlready = false;

/** Define a synchronous transaction program receiving its transaction directly. */
export function makeTx(name: string, options?: { rollback: 'always' }) {
  return function <
    CONFIG extends IDbConfig,
    ARGS extends unknown[],
    SUCCESS,
    YIELD extends Effect.Effect<unknown, unknown, unknown>,
  >(
    program: ((
      tx: ITx<CONFIG>,
      ...args: ARGS
    ) => Generator<YIELD, SUCCESS, unknown>) &
      ([Extract<Effect.Services<YIELD>, Async>] extends [never]
        ? unknown
        : never) &
      ([Extract<SUCCESS, PromiseLike<unknown>>] extends [never]
        ? unknown
        : never),
  ) {
    return Effect.fn(name)(function* (
      db: IDb<CONFIG>,
      ...args: ARGS
    ): Effect.fn.Return<
      SUCCESS,
      | ([YIELD] extends [never]
          ? never
          : [YIELD] extends [Effect.Effect<unknown, infer E, unknown>]
            ? E
            : never)
      | IZerospinError<'drizzle-transaction-failed'>,
      [YIELD] extends [never]
        ? never
        : [YIELD] extends [Effect.Effect<unknown, unknown, infer R>]
          ? R
          : never
    > {
      const body = (tx: ITx<CONFIG>) => Effect.gen(() => program(tx, ...args));
      const context =
        yield* Effect.context<Effect.Services<ReturnType<typeof body>>>();
      const rollback = new Error('transaction-rollback');
      let captured:
        | Exit.Exit<SUCCESS, Effect.Error<ReturnType<typeof body>>>
        | undefined;
      const exit = yield* Effect.try({
        try: () => {
          if (inTxAlready) {
            throw new Error('nested-transaction-not-allowed');
          }
          inTxAlready = true;
          try {
            return db.transaction(tx => {
              const exit = Effect.runSyncExitWith(context)(body(tx));
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
                captured = exit;
                throw rollback;
              }
              if (options?.rollback === 'always') {
                captured = exit;
                throw rollback;
              }
              return exit;
            });
          } catch (cause) {
            // Only the exact sentinel can turn a completed rollback into a result.
            if (cause === rollback && captured !== undefined) return captured;
            // oxlint-disable-next-line eslint/no-throw-literal -- Preserve the original transaction failure for Effect.try.
            throw cause;
          } finally {
            inTxAlready = false;
          }
        },
        catch: error => {
          return makeZerospinError({
            code: 'drizzle-transaction-failed',
            message: `Failed to begin database transaction: ${error}`,
            cause: prettyUnknownFailure(error),
          });
        },
      });
      if (Exit.isSuccess(exit)) return exit.value;
      const failure = Cause.findErrorOption(exit.cause);
      if (
        exit.cause.reasons.every(Cause.isFailReason) &&
        Option.isSome(failure)
      ) {
        return yield* Effect.fail(failure.value);
      }
      return yield* Effect.fail(
        makeZerospinError({
          code: 'drizzle-transaction-failed',
          message: 'Failed to run database transaction',
          cause: prettyUnknownFailure(exit.cause),
        }),
      );
    });
  };
}
