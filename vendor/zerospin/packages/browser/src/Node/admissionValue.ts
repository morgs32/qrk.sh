import {
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
export function admissionValue<A>(
  result: IResult<A, IAnyError | IZerospinErrorJson>,
): A {
  if (result._tag === 'Failure') throw makeZerospinError(result.failure);
  return result.success;
}
