import {
  isZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { Effect } from 'effect';

import type { IDb } from '../drizzle/types.ts';
import { runProgram } from '../execution/runProgram.ts';

import { validateFailure } from './failureCodec.ts';
import type { IPreparedContractInput } from './prepareContractInput.ts';
import type { IContract, InferFailure } from './types.ts';

export function runContractGuard<CONTRACT extends IContract>(props: {
  contract: CONTRACT;
  db: Readonly<Pick<IDb, 'query'>>;
  input: IPreparedContractInput<CONTRACT>;
}): Effect.Effect<
  void,
  IAnyError | InferFailure<CONTRACT>,
  Effect.Services<ReturnType<NonNullable<CONTRACT['guard']>>>
>;
export function runContractGuard(props: {
  contract: IContract;
  db: Readonly<Pick<IDb, 'query'>>;
  input: IPreparedContractInput;
}) {
  return Effect.gen(function* () {
    const { contract, db, input } = props;
    return yield* runProgram(
      Effect.suspend(
        () =>
          contract.guard?.({
            db,
            ...input,
            failures: contract.failures,
          }) ?? Effect.void,
      ),
    ).pipe(
      Effect.flatMap(result =>
        result === undefined
          ? Effect.void
          : Effect.fail(makeZerospinError('contract-guard-result-invalid')),
      ),
      Effect.catch(failure =>
        isZerospinError(failure) && !('scope' in failure)
          ? Effect.fail(failure)
          : validateFailure(contract, failure, 'contract').pipe(
              Effect.flatMap(Effect.fail),
            ),
      ),
    );
  });
}
