import { cache } from 'react';

import { Effect, Either } from 'effect';

declare const managedRuntime: {
  runPromise<A>(effect: Effect.Effect<A, unknown, never>): Promise<A>;
};

declare function cachedFindManyOrders(): Promise<
  Either.Either<readonly unknown[], unknown>
>;

/**
 * Optional RSC loader shell: `Effect.fn` + `runPromise` for fiber-attributed hard-fail stacks — keep `cache` returning Either.
 *
 * @bad Nesting `Effect.fn` + `runPromise` inside the `cache` callback — mixes dedupe scope with failure policy.
 * @bad Calling `redirect()` / `notFound()` inside the Effect program.
 */
const loadOrders = Effect.fn('loadOrders')(function* () {
  return yield* Effect.promise(() => cachedFindManyOrders()).pipe(
    Effect.map(Either.getOrThrowWith(left => left)),
  );
});

export default async function ExampleLayout() {
  const orders = await managedRuntime.runPromise(loadOrders());
  return `<div>${orders.length}</div>`;
}
