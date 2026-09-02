import {
  ZerospinError,
  type IEncodedResult,
  type ZerospinError as IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema, SchemaIssue } from 'effect';

import { RpcResultSchema } from './encodeRpc.ts';

export const decodeRpc = Effect.fn('decodeRpc')(
  <T, CODE extends string = string>(
    encoded: IEncodedResult<T, IZerospinErrorJson<CODE>>,
  ): Effect.Effect<
    T,
    IZerospinError<CODE> | IZerospinError<'failed-to-decode-rpc'>
  > =>
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
