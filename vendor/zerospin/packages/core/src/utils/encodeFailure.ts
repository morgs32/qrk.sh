import {
  ZerospinError,
  type IEncodedResult,
  type ZerospinError as IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Schema } from 'effect';

export function encodeFailure<CODE extends string>(
  value: IZerospinError<CODE>,
): IEncodedResult<never, IZerospinErrorJson<CODE>> {
  const failure = Schema.encodeSync(ZerospinError.schema)(value);
  return {
    _tag: 'Failure',
    failure: { ...failure, code: value.code },
  };
}
