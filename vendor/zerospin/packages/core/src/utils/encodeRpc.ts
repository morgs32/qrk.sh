import {
  ZerospinError,
  type IEncodedResult,
  type ZerospinError as IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { encodeFailure } from './encodeFailure.ts';
import { encodeSuccess } from './encodeSuccess.ts';

export const RpcResultSchema = Schema.toCodecJson(
  Schema.Result(Schema.Any, ZerospinError.schema),
);

export function encodeRpc<T, CODE extends string = string, R = never>(
  program: Effect.Effect<T, IZerospinError<CODE>, R>,
): Effect.Effect<IEncodedResult<T, IZerospinErrorJson<CODE>>, never, R> {
  return program.pipe(
    Effect.match({
      onFailure: encodeFailure,
      onSuccess: encodeSuccess,
    }),
  );
}
