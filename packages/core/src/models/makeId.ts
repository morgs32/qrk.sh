import type { IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation, type CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

export const makeId = Effect.fn('models.makeId')(function* <
  const ABBREVIATION extends string,
>(
  model: Readonly<{ abbreviation: ABBREVIATION }>,
): Effect.fn.Return<`${ABBREVIATION}_${string}`, IAnyError, CuidFactory> {
  return yield* makeIdFromAbbreviation({ abbreviation: model.abbreviation });
});
