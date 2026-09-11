import type { IAnyError } from '@zerospin/error';
import { Context, Effect, Layer } from 'effect';

import type { IDb } from '../drizzle/types.ts';

import { runGuard } from './runGuard.ts';

/** Acquire owner services once and bind them before entering a heterogeneous registry. */
export const initializeGuards = Effect.fn('initializeGuards')(function* <
  SERVICES,
  INPUTS,
  REQUIREMENTS,
  GUARD_SERVICES = never,
  GUARD_REQUIREMENTS = never,
>(props: {
  layer: Layer.Layer<SERVICES, IAnyError, INPUTS>;
  guardLayer?:
    | ((props: {
        db: Readonly<Pick<IDb, 'query'>>;
        authentication: Readonly<Record<string, unknown>> | null;
      }) => Layer.Layer<GUARD_SERVICES, IAnyError, GUARD_REQUIREMENTS>)
    | undefined;
  guards: Readonly<
    Record<
      string,
      readonly ((props: {
        db: Readonly<Pick<IDb, 'query'>>;
        authentication: Readonly<Record<string, unknown>> | null;
        payload: unknown;
      }) => Effect.Effect<void, IAnyError, REQUIREMENTS>)[]
    >
  >;
}) {
  const application = yield* Effect.context<
    Exclude<REQUIREMENTS, SERVICES> | INPUTS | GUARD_REQUIREMENTS
  >();
  // Each owner has its own acquisition even when definitions reuse a layer value.
  const local = yield* Layer.build(Layer.fresh(props.layer));
  return {
    context: local,
    run: (
      commandName: string,
      inputs: {
        db: Readonly<Pick<IDb, 'query'>>;
        authentication: Readonly<Record<string, unknown>> | null;
        payload: unknown;
      },
    ) =>
      runGuard({
        props: inputs,
        guard: () =>
          Effect.scoped(
            Effect.gen(function* () {
              const dynamic: Context.Context<never> =
                props.guardLayer === undefined
                  ? Context.empty()
                  : yield* Layer.build(Layer.fresh(props.guardLayer(inputs)));
              for (const guard of props.guards[commandName] ?? []) {
                yield* guard(inputs).pipe(
                  Effect.provideContext(dynamic),
                  Effect.provideContext(local),
                  Effect.provideContext(application),
                );
              }
            }),
          ),
      }).pipe(Effect.provideContext(application)),
  };
});
