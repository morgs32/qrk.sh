import {
  isZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDb } from '../drizzle/types.ts';
import { runProgram } from '../execution/runProgram.ts';

import { validateFailure } from './failureCodec.ts';
import type { IContract, InferFailure } from './types.ts';
import { validatePayload } from './validatePayload.ts';

export function runContractGuard<CONTRACT extends IContract>(props: {
  contract: CONTRACT;
  queryDb: Readonly<Pick<IDb, 'query'>>;
  payload: unknown;
  identity: Readonly<Record<string, unknown>> | null;
}): Effect.Effect<
  void,
  IAnyError | InferFailure<CONTRACT>,
  Effect.Services<ReturnType<NonNullable<CONTRACT['guard']>>>
>;
export function runContractGuard(props: {
  contract: IContract;
  queryDb: Readonly<Pick<IDb, 'query'>>;
  payload: unknown;
  identity: Readonly<Record<string, unknown>> | null;
}) {
  return Effect.gen(function* () {
    const { contract, queryDb } = props;
    const payload = yield* validatePayload(contract, {
      version: contract.version,
      payload: props.payload,
    });
    const identity =
      contract.identity === undefined
        ? props.identity
        : yield* runProgram(
            Schema.decodeUnknownEffect(Schema.toType(contract.identity))(
              props.identity,
            ).pipe(
              mapParseError({
                code: 'contract-identity-invalid',
                prefix: 'Invalid contract identity',
              }),
            ),
          );
    yield* runProgram(
      Effect.suspend(
        () =>
          contract.guard?.({
            queryDb,
            payload,
            identity,
            failures: contract.failures,
          }) ?? Effect.void,
      ),
    ).pipe(
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
