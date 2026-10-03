import { Context, Effect, type ManagedRuntime } from 'effect';

/** Contract programs erase their requirements; the fixture supplies its complete application context. */
export function runFixture<A, E, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, unknown>,
): Promise<A> {
  return runtime.runPromise(
    Effect.flatMap(runtime.contextEffect, context =>
      Effect.provideContext(
        effect,
        Context.makeUnsafe<unknown>(context.mapUnsafe),
      ),
    ),
  );
}
