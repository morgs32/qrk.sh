import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { runProgram } from '../execution/runProgram.ts';

import type { IAsyncCommandInput } from './AsyncCommandInputSchema.ts';
import type { IContract } from './types.ts';

/** Decode frozen JSON with the async contract's payload and producer observation codecs. */
export const decodeAsyncInput = Effect.fn('decodeAsyncInput')(function* (
  contract: IContract,
  payload: unknown,
  input: IAsyncCommandInput,
) {
  const definition = contract.async;
  if (definition === undefined) {
    return yield* makeZerospinError('async-contract-required');
  }
  return yield* validateAsyncValues(contract, payload, input.external);
});
/** Replaying codecs must accept the original encoded values; public payload adapters are never used. */
export const validateAsyncValues = Effect.fn('validateAsyncValues')(function* (
  contract: IContract,
  payload: unknown,
  external: unknown,
) {
  const definition = contract.async;
  if (definition === undefined) {
    return yield* makeZerospinError('async-contract-required');
  }
  const decodedPayload = yield* runProgram(
    Schema.decodeUnknownEffect(makeEffectSchema(contract.payload))(payload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'async-payload-invalid',
        prefix: 'Invalid frozen async payload',
      }),
    ),
  );
  const decodedExternal = yield* runProgram(
    Schema.decodeUnknownEffect(definition.external.result)(external, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'async-external-invalid',
        prefix: 'Invalid external observation',
      }),
    ),
  );
  return { payload: decodedPayload, external: decodedExternal };
});
