import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { IAnyDrizzleSchemas } from '@zerospin/schema';
import type { AnyRelations, DrizzleTypeError } from 'drizzle-orm';
import { Cause, Effect, Exit, Option } from 'effect';

import type { Async } from '../async/Async.ts';

import type { IDbConfig, ITx } from './types.ts';

export const withSavepoint = Effect.fn('withSavepoint')(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
  SUCCESS,
  ERROR extends IAnyError,
  PROGRAM_REQUIREMENTS,
>(props: {
  tx: ITx<IDbConfig<SCHEMA, RELATIONS>>;
  program: (props: { tx: ITx<IDbConfig<SCHEMA, RELATIONS>> }) => Effect.Effect<
    // oxlint-disable-next-line typescript/no-explicit-any -- Drizzle savepoint callback is synchronous; Promise<any> is its exact rejection check.
    SUCCESS extends Promise<any>
      ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
      : SUCCESS,
    ERROR,
    [Extract<PROGRAM_REQUIREMENTS, Async>] extends [never]
      ? PROGRAM_REQUIREMENTS
      : never
  >;
}): Effect.fn.Return<
  SUCCESS,
  IAnyError,
  [Extract<PROGRAM_REQUIREMENTS, Async>] extends [never]
    ? PROGRAM_REQUIREMENTS
    : never
> {
  const { program, tx } = props;
  const context =
    yield* Effect.context<
      [Extract<PROGRAM_REQUIREMENTS, Async>] extends [never]
        ? PROGRAM_REQUIREMENTS
        : never
    >();

  return yield* Effect.try({
    try: (): SUCCESS =>
      tx.transaction(savepointTx => {
        const exit = Effect.runSyncExitWith(context)(
          program({ tx: savepointTx }),
        );
        if (Exit.isFailure(exit)) {
          throw exit;
        }
        return exit.value;
      }),
    catch: cause => {
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
        code: 'drizzle-savepoint-failed',
        message: `Failed to run database savepoint: ${ZerospinError.prettyUnknownFailure(cause)}`,
        cause: ZerospinError.prettyUnknownFailure(cause),
      });
    },
  });
});
