import { Effect, Layer } from 'effect';

import { CuidFactory } from '../services/CuidFactory.ts';

import type { IIdPrefix } from './types.ts';

export function makePrefixedIncrementalIdFactory(idPrefix: IIdPrefix) {
  return Layer.effect(
    CuidFactory,
    Effect.sync(() => {
      let count = 0;
      return CuidFactory.of(() => Effect.succeed(`${idPrefix}-${count++}`));
    }),
  );
}
