import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import { runProgram } from '../execution/runProgram.ts';

import type { IContract } from './types.ts';

/** Replay decodes the frozen request arguments and recorded response without payload adapters. */
export const validateExternalResponse = Effect.fn('validateExternalResponse')(
  function* (contract: IContract, payload: unknown, response: unknown) {
    const declaration = contract.external;
    if (declaration === undefined) {
      return yield* makeZerospinError('external-contract-required');
    }
    const decodedPayload = yield* runProgram(
      Schema.decodeUnknownEffect(makeEffectSchema(contract.payload))(payload, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'external-payload-invalid',
          prefix: 'Invalid frozen external contract payload',
        }),
      ),
    );
    const decodedResponse = yield* runProgram(
      Schema.decodeUnknownEffect(declaration.response)(response, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'external-response-invalid',
          prefix: 'Invalid recorded external response',
        }),
      ),
    );
    return { payload: decodedPayload, response: decodedResponse };
  },
);
