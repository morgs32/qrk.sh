import {
  ZerospinError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

export const EitherSchema = Schema.Either({
  left: ZerospinError.schema,
  right: Schema.Any,
});

export function encodeRpc<T, CODE extends string = string, R = never>(
  program: Effect.Effect<T, IZerospinError<CODE>, R>,
): Effect.Effect<Schema.EitherEncoded<T, IZerospinErrorJson<CODE>>, never, R> {
  return program.pipe(
    Effect.either,
    Effect.map(
      either =>
        // ALLOWED_CAST: We can't cross the EitherSchema boundary without a cast.
        Schema.encodeUnknownSync(EitherSchema)(either) as Schema.EitherEncoded<
          T,
          IZerospinErrorJson<CODE>
        >,
    ),
  );
}
