import { Effect, Layer } from 'effect';

import { MonotonicFactory } from '../services/MonotonicFactory.ts';

/** Test layer: raw monotonic suffixes; combine with `makeCursor({ abbreviation })` for cursor ids. */
export const IncrementalMonotonicFactory = Layer.effect(
  MonotonicFactory,
  Effect.sync(() => {
    let count = 0;
    return MonotonicFactory.of(() =>
      Effect.succeed(String(count++).padStart(20, '0')),
    );
  }),
);
