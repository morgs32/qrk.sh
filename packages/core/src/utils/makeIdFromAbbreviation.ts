import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { CuidFactory } from '../services/CuidFactory.ts';

export const makeIdFromAbbreviation = Effect.fn('makeIdFromAbbreviation')(
  function* <const ABBREVIATION extends string>(props: {
    abbreviation: ABBREVIATION;
  }): Effect.fn.Return<`${ABBREVIATION}_${string}`, IAnyError, CuidFactory> {
    const { abbreviation } = props;
    const makeId = yield* CuidFactory;
    return `${abbreviation}_${yield* makeId()}`;
  },
);
