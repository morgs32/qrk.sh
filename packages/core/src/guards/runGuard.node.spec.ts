import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { expect, it } from 'vitest';

import { runGuard } from './runGuard.ts';

it('inherits services provided around the enclosing program', async () => {
  const observed: string[] = [];
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* runGuard({
        guard: () =>
          Effect.gen(function* () {
            const makeId = yield* CuidFactory;
            observed.push(yield* makeId());
          }),
        props: {},
      });
    }).pipe(
      Effect.provide(Layer.succeed(CuidFactory, () => Effect.succeed('owner'))),
    ),
  );
  expect(observed).toEqual(['owner']);
});
