import { Either, Schema } from 'effect';

import { EitherSchema } from './encodeRpc.ts';

export function encodeRight<T>(value: T) {
  return Schema.encodeUnknownSync(EitherSchema)(Either.right(value));
}
