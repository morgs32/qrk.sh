import {
  makeZerospinError,
  prettyUnknownFailure,
  type IZerospinError,
} from '@zerospin/error';
import type { IAnyDrizzleSchemas } from '@zerospin/schema';
import type { AnyRelations } from 'drizzle-orm';
import { Cause, Effect, Exit, Option } from 'effect';

import type { Async } from '../async/Async.ts';

import type { IDbConfig, ITx } from './types.ts';

export const withSavepoint = Effect.fn('withSavepoint')(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
  SUCCESS,
  ERROR,
  PROGRAM_REQUIREMENTS,
>(
  props: {
    tx: ITx<IDbConfig<SCHEMA, RELATIONS>>;
    program: (props: {
      tx: ITx<IDbConfig<SCHEMA, RELATIONS>>;
    }) => Effect.Effect<
      SUCCESS,
      ERROR,
      [Extract<PROGRAM_REQUIREMENTS, Async>] extends [never]
        ? PROGRAM_REQUIREMENTS
        : never
    >;
  } & ([Extract<SUCCESS, PromiseLike<unknown>>] extends [never]
    ? unknown
    : never),
): Effect.fn.Return<
  SUCCESS,
  ERROR | IZerospinError<'drizzle-savepoint-failed'>,
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

  const rollback = new Error('savepoint-rollback');
  let captured: Exit.Exit<SUCCESS, ERROR> | undefined;
  const exit = yield* Effect.try({
    try: () => {
      try {
        return tx.transaction(savepointTx => {
          const exit = Effect.runSyncExitWith(context)(
            program({ tx: savepointTx }),
          );
          if (Exit.isFailure(exit)) {
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
          return exit;
        });
      } catch (cause) {
        if (cause === rollback && captured !== undefined) return captured;
        // oxlint-disable-next-line eslint/no-throw-literal -- Preserve the original savepoint failure for Effect.try.
        throw cause;
      }
    },
    catch: cause => {
      return makeZerospinError({
        code: 'drizzle-savepoint-failed',
        message: `Failed to run database savepoint: ${prettyUnknownFailure(cause)}`,
        cause: prettyUnknownFailure(cause),
      });
    },
  });
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.findErrorOption(exit.cause);
  if (exit.cause.reasons.every(Cause.isFailReason) && Option.isSome(failure)) {
    return yield* Effect.fail(failure.value);
  }
  return yield* Effect.fail(
    makeZerospinError({
      code: 'drizzle-savepoint-failed',
      message: 'Failed to run database savepoint',
      cause: prettyUnknownFailure(exit.cause),
    }),
  );
});
