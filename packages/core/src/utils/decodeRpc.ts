import {
  ZerospinError,
  type ZerospinError as IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Either, ParseResult, Schema } from 'effect';

import { EitherSchema } from './encodeRpc.ts';

export const decodeRpc = Effect.fn('decodeRpc')(
  <T, CODE extends string = string>(
    encoded: Schema.EitherEncoded<T, IZerospinErrorJson<CODE>>,
  ): Effect.Effect<
    T,
    IZerospinError<CODE> | IZerospinError<'failed-to-decode-rpc'>
  > =>
    Schema.decode(EitherSchema)(encoded).pipe(
      Effect.mapError(
        error =>
          new ZerospinError({
            code: 'failed-to-decode-rpc',
            message: 'Failed to decode RPC EitherEncoded',
            cause: ParseResult.TreeFormatter.formatErrorSync(error),
          }),
      ),
      Effect.flatMap(either =>
        Either.match(either, {
          // ALLOWED_CAST: We can't cross the EitherSchema boundary without a cast.
          onLeft: left => left as IZerospinError<CODE>,
          onRight: right => Effect.succeed(right),
        }),
      ),
    ),
);
