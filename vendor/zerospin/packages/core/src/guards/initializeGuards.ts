import type { IAnyError } from '@zerospin/error';
import { Effect, Layer } from 'effect';

import type { IDb } from '../drizzle/types.ts';

import { runGuard } from './runGuard.ts';

/** Acquire owner services once and bind them before entering a heterogeneous registry. */
export const initializeGuards = Effect.fn('initializeGuards')(function* <
  SERVICES,
  INPUTS,
  REQUIREMENTS,
>(props: {
  layer: Layer.Layer<SERVICES, IAnyError, INPUTS>;
  guards: Readonly<
    Record<
      string,
      readonly ((props: {
        db: Readonly<Pick<IDb, 'query'>>;
        userId: string | null;
        payload: unknown;
      }) => Effect.Effect<void, IAnyError, REQUIREMENTS>)[]
    >
  >;
}) {
  const application = yield* Effect.context<Exclude<REQUIREMENTS, SERVICES>>();
  // Each owner has its own acquisition even when definitions reuse a layer value.
  const local = yield* Layer.build(Layer.fresh(props.layer));
  return {
    context: local,
    run: (
      commandName: string,
      inputs: {
        db: Readonly<Pick<IDb, 'query'>>;
        userId: string | null;
        payload: unknown;
      },
    ) =>
      Effect.gen(function* () {
        for (const guard of props.guards[commandName] ?? []) {
          yield* runGuard({ guard, props: inputs }).pipe(
            Effect.provideContext(local),
            Effect.provideContext(application),
          );
        }
      }),
  };
});
