import { Effect, Layer } from 'effect';
import { monotonicFactory as ulidMonotonicFactory } from 'ulid';

import { MonotonicFactory } from '../services/MonotonicFactory.ts';

export const UlidMonotonicFactory = Layer.effect(
  MonotonicFactory,
  Effect.sync(() => {
    const makeMonotonic = ulidMonotonicFactory();
    return MonotonicFactory.of(() => Effect.sync(() => makeMonotonic()));
  }),
);
