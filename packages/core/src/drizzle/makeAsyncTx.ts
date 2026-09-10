import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Cause, Effect, Exit, Option } from 'effect';

import type { Async } from '../async/Async.js';
import { makeAsync } from '../async/makeAsync.js';

export const makeAsyncTx = Effect.fn('makeAsyncTx')(function* <
  SUCCESS,
  ERROR extends IAnyError,
  PROGRAM_REQUIREMENTS,
>(props: {
  storage: {
    transaction: <TRANSACTION_SUCCESS>(
      closure: (transaction: {
        rollback: () => void;
      }) => Promise<TRANSACTION_SUCCESS>,
    ) => Promise<TRANSACTION_SUCCESS>;
  };
  program: () => Effect.Effect<SUCCESS, ERROR, PROGRAM_REQUIREMENTS>;
}): Effect.fn.Return<SUCCESS, IAnyError, Async | PROGRAM_REQUIREMENTS> {  const { program, storage } = props;
const context = yield* Effect.context<PROGRAM_REQUIREMENTS>();

  return yield* makeAsync(
    () =>
      storage.transaction(async () => {
        const exit = await Effect.runPromiseExitWith(context)(program());
        if (Exit.isFailure(exit)) {
          throw exit;
        }
        return exit.value;
      }),
    cause => {
      if (Exit.isExit(cause) && Exit.isFailure(cause)) {
        const failure = Cause.findErrorOption(cause.cause);
        if (
          Option.isSome(failure) &&
          ZerospinError.isZerospinError(failure.value)
        ) {
          return failure.value;
        }
      }

      return new ZerospinError({
        code: 'async-drizzle-transaction-failed',
        message: `Failed to run asynchronous database transaction: ${ZerospinError.prettyUnknownFailure(cause)}`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      });
    },
  );
});
