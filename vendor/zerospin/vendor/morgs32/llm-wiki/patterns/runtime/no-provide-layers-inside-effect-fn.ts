import { Effect } from 'effect';

declare const NanoIdFactory: unknown;
declare function makeCommand(
  props: unknown,
): Effect.Effect<unknown, unknown, typeof NanoIdFactory>;

/**
 * Provide layers at the run boundary — not inside `Effect.fn` bodies.
 *
 * @bad `yield* makeCommand(props).pipe(Effect.provide(NanoIdFactory))` inside the named procedure.
 */
export const buildCommand = Effect.fn('buildCommand')(function* (props: {
  commandName: string;
  payload: unknown;
}) {
  const command = yield* makeCommand(props);
  return command;
});

// caller: managedRuntime.runPromise(buildCommand(props).pipe(Effect.provide(NanoIdFactory)))
