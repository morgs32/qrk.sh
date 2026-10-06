import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  ZerospinErrorJsonSchema,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';
/** Only existing public error fields cross a worker RPC boundary. */
export function publicRpcError(error: Error): Error {
  const publicFields = Effect.runSync(
    encodeError(
      isZerospinError(error)
        ? error
        : makeZerospinError({
            code: 'node-rpc-failed',
            message: 'Worker RPC failed',
          }),
    ),
  );
  const retained = Object.assign(new Error(publicFields.message), publicFields);
  delete retained.stack;
  return retained;
}
export function restoreRpcError(error: unknown): never {
  const decoded = Schema.decodeUnknownOption(ZerospinErrorJsonSchema)(error);
  if (decoded._tag === 'Some') throw makeZerospinError(decoded.value);
  throw error;
}
