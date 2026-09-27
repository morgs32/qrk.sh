import type { IResult } from '@zerospin/error';

export function resultFailure<E>(failure: E): IResult<never, E> {
  return { _tag: 'Failure', failure };
}
