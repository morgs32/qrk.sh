import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { Context, Effect, Schema } from 'effect';

import { runProgram } from '../execution/runProgram.ts';

import type { IContract, InferContractResult } from './types.ts';

const runCodec = <A, E>(program: Effect.Effect<A, E>) =>
  runProgram(program).pipe(
    Effect.updateContext((_: Context.Context<never>) => Context.empty()),
  );
export const encodeContractResult = Effect.fn('encodeContractResult')(
  function* (contract: IContract, value: unknown) {
    if (contract.result === undefined) {
      if (value !== undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'contract-program-result-invalid',
            message: 'A contract without a result codec must return void',
          }),
        );
      }
      return null;
    }
    const validated = yield* runCodec(
      Schema.decodeUnknownEffect(Schema.toType(contract.result))(value, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-program-result-invalid',
          prefix: 'Invalid contract result',
        }),
      ),
    );
    const encoded = yield* runCodec(
      Schema.encodeEffect(contract.result)(validated).pipe(
        mapParseError({
          code: 'contract-result-encode-failed',
          prefix: 'Cannot encode contract result',
        }),
      ),
    );
    return yield* Schema.decodeUnknownEffect(Schema.Json)(encoded).pipe(
      mapParseError({
        code: 'contract-result-encoding-invalid',
        prefix: 'Contract result must encode as JSON',
      }),
    );
  },
);
export function resolveContractResult<C extends IContract>(
  contract: C,
  saved: { commandName: string; contractVersion: string; result: unknown },
): Effect.Effect<InferContractResult<C>, IAnyError>;
export function resolveContractResult(
  contract: IContract,
  saved: { commandName: string; contractVersion: string; result: unknown },
) {
  return Effect.gen(function* () {
    if (
      saved.commandName !== contract.commandName ||
      saved.contractVersion !== contract.version
    ) {
      return yield* Effect.fail(
        makeZerospinError('contract-result-identity-mismatch'),
      );
    }
    if (contract.result === undefined) {
      yield* Schema.decodeUnknownEffect(Schema.Null)(saved.result).pipe(
        mapParseError({
          code: 'contract-result-decode-failed',
          prefix: 'Expected null for a contract without a result',
        }),
      );
      return;
    }
    return yield* runCodec(
      Schema.decodeUnknownEffect(contract.result)(saved.result, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-result-decode-failed',
          prefix: 'Invalid retained contract result',
        }),
      ),
    );
  });
}
