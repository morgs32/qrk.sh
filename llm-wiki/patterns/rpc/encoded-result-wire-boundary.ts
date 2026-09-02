import {
  ZerospinError,
  type IEncodedResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema, SchemaIssue } from 'effect';

/**
 * Encode RPC outcomes with the canonical Effect Result JSON codec and decode them once at the wire boundary.
 * A rejected RPC Promise is a transport/runtime failure: convert it with `makeAsync` before `decodeRpc`.
 * `decodeRpc` preserves a valid encoded domain error and creates `failed-to-decode-rpc` only for an invalid envelope.
 *
 * @bad Define another RPC Promise alias or a parallel envelope type.
 * @bad Translate a superseded envelope at decode time.
 * @bad Reimplement Result encoding separately in each RPC target.
 * @bad Replace a valid encoded domain error with a generic boundary error.
 * @bad Treat a rejected Promise as though it were an encoded Failure.
 */
export const RpcResultSchema = Schema.toCodecJson(
  Schema.Result(Schema.Any, ZerospinError.schema),
);

export function encodeSuccess<T>(value: T): IEncodedResult<T, never> {
  return { _tag: 'Success', success: value };
}

export function encodeFailure(
  value: ZerospinError,
): IEncodedResult<never, IZerospinErrorJson> {
  return {
    _tag: 'Failure',
    failure: Schema.encodeSync(ZerospinError.schema)(value),
  };
}

export function encodeRpc<T, R>(
  program: Effect.Effect<T, ZerospinError, R>,
): Effect.Effect<IEncodedResult<T, IZerospinErrorJson>, never, R> {
  return program.pipe(
    Effect.match({
      onFailure: encodeFailure,
      onSuccess: encodeSuccess,
    }),
  );
}

export const decodeRpc = Effect.fn('decodeRpc')(
  <T>(encoded: IEncodedResult<T, IZerospinErrorJson>) =>
    Schema.decodeUnknownEffect(RpcResultSchema)(encoded).pipe(
      Effect.mapError(
        error =>
          new ZerospinError({
            code: 'failed-to-decode-rpc',
            message: 'Failed to decode RPC Result',
            cause: SchemaIssue.makeFormatterDefault()(error.issue),
          }),
      ),
      Effect.flatMap(() =>
        encoded._tag === 'Failure'
          ? Effect.fail(new ZerospinError(encoded.failure))
          : Effect.succeed(encoded.success),
      ),
    ),
);
