import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { AnyRelations, DrizzleTypeError } from 'drizzle-orm';
import { Cause, Effect, Exit, Option, Runtime } from 'effect';

import { type Async } from '../async/Async.ts';
import type { IAnyDrizzleSchemas } from '../models/types.ts';

import type { IDb, IDbConfig, ITx } from './types.ts';

type IRejectAsync<REQUIREMENTS> = [Extract<REQUIREMENTS, Async>] extends [never]
  ? REQUIREMENTS
  : never;

let inTxAlready = false;

export const makeTx = Effect.fn('makeTx')(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
  SUCCESS,
  ERROR extends IAnyError,
  PROGRAM_REQUIREMENTS,
>(props: {
  db: IDb<IDbConfig<SCHEMA, RELATIONS>>;
  program: (props: { tx: ITx<IDbConfig<SCHEMA, RELATIONS>> }) => Effect.Effect<
    // oxlint-disable-next-line typescript/no-explicit-any -- Drizzle transaction callback is unbranded; ITx carries the Tx brand.
    SUCCESS extends Promise<any>
      ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
      : SUCCESS,
    ERROR,
    IRejectAsync<PROGRAM_REQUIREMENTS>
  >;
}): Effect.fn.Return<SUCCESS, IAnyError, IRejectAsync<PROGRAM_REQUIREMENTS>> {
  const { db, program } = props;
  const runtime = yield* Effect.runtime<IRejectAsync<PROGRAM_REQUIREMENTS>>();

  return yield* Effect.try({
    try: (): SUCCESS => {
      if (inTxAlready) {
        throw new Error('nested-transaction-not-allowed');
      }
      inTxAlready = true;
      try {
        return db.transaction(tx => {
          const exit = Runtime.runSyncExit(
            runtime,
            program({
              tx,
            }),
          );
          if (Exit.isFailure(exit)) {
            throw exit;
          }
          return exit.value;
        });
      } finally {
        inTxAlready = false;
      }
    },
    catch: error => {
      if (Exit.isExit(error) && Exit.isFailure(error)) {
        const failure = Cause.failureOption(error.cause);
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
