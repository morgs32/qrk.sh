import type { IEncodedResult } from '@zerospin/error';

export function encodeSuccess<T>(value: T): IEncodedResult<T, never> {
  return { _tag: 'Success', success: value };
}
