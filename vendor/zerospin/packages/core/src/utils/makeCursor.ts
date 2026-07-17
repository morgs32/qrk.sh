import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { InferIdFromAbbreviation } from '../models/types.ts';
import { MonotonicFactory } from '../services/MonotonicFactory.ts';

export const makeCursor = Effect.fn('makeCursor')(function* <
  const ABBREVIATION extends string,
>(props: {
  abbreviation: ABBREVIATION;
}): Effect.fn.Return<
  InferIdFromAbbreviation<ABBREVIATION>,
  IAnyError,
  MonotonicFactory
> {
  const { abbreviation } = props;
  const makeMonotonic = yield* MonotonicFactory;
  return `${abbreviation}_${yield* makeMonotonic()}`;
});
