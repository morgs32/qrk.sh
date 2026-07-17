import { type IZerospinError } from '@zerospin/error';
import { Either, Schema } from 'effect';

import { EitherSchema } from './encodeRpc.ts';

export function encodeLeft<CODE extends string>(value: IZerospinError<CODE>) {
  return Schema.encodeUnknownSync(EitherSchema)(Either.left(value));
}
