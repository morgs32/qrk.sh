import { it } from '@effect/vitest';
import { Cause, Context, Effect, Exit, Fiber, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Active = makeState({
  stateName: 'active',
  input: { count: Schema.Number },
});

class ActorResource extends Context.Service<
  ActorResource,
  { readonly id: number }
>()('actor-layer/ActorResource') {}

const makeTrackedLayer = (events: Array<string>): Layer.Layer<ActorResource> =>
  Layer.effect(ActorResource)(
    Effect.acquireRelease(
      Effect.sync(() => {
        const id =
          events.filter(event => event.startsWith('acquire:')).length + 1;
        events.push(`acquire:${id}`);
        return { id };
      }),
      ({ id }) => Effect.sync(() => events.push(`release:${id}`)),
    ),
  );

const makePingMachine = (observedResourceIds: Array<number>) =>
  makeMachine({
    states: { active: Active },
    initial: Active.make({ count: 0 }),
    routes: {
      active: {
        commands: {
          ping: {
            payload: Schema.Void,
            program: Effect.fn('active.ping')(function* ({ origin }) {
              const resource = yield* ActorResource;
              observedResourceIds.push(resource.id);
              return Active.make({ count: origin.count + 1 });
            }),
          },
        },
      },
    },
  });

describe('MachineActor ManagedRuntime', () => {
  it.effect('lazily acquires one shared Layer for one Actor', () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const observedResourceIds: Array<number> = [];

      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquireTestRuntime(makeTrackedLayer(events));
          const actor = makeActor(makePingMachine(observedResourceIds), {
            runtime,
          });

          expect(events).toEqual([]);
          const actorFiber = actor.start();
          yield* actor.ready();
          const first = yield* actor.getHandle();
          const second = yield* first.commands.ping();
          yield* second.commands.ping();

          expect(events).toEqual(['acquire:1']);
          expect(observedResourceIds).toEqual([1, 1]);
          yield* Fiber.interrupt(actorFiber);
          expect(events).toEqual(['acquire:1']);
        }),
      );

      expect(events).toEqual(['acquire:1', 'release:1']);
    }),
  );

  it.effect('shares one service instance across Actors in one runtime', () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const observedResourceIds: Array<number> = [];

      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquireTestRuntime(makeTrackedLayer(events));
          const machine = makePingMachine(observedResourceIds);
          const actorOne = makeActor(machine, { runtime });
          const actorTwo = makeActor(machine, { runtime });
          const fiberOne = actorOne.start();
          const fiberTwo = actorTwo.start();
          yield* actorOne.ready();
          yield* actorTwo.ready();

          const handleOne = yield* actorOne.getHandle();
          const handleTwo = yield* actorTwo.getHandle();
          yield* handleOne.commands.ping();
          yield* handleTwo.commands.ping();

          expect(events).toEqual(['acquire:1']);
          expect(observedResourceIds).toEqual([1, 1]);
          yield* Fiber.interrupt(fiberOne);
          yield* Fiber.interrupt(fiberTwo);
        }),
      );

      expect(events).toEqual(['acquire:1', 'release:1']);
    }),
  );

  it.effect('isolates Actors started by distinct runtimes', () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const observedResourceIds: Array<number> = [];

      yield* Effect.scoped(
        Effect.gen(function* () {
          const layer = makeTrackedLayer(events);
          const runtimeOne = yield* acquireTestRuntime(layer);
          const runtimeTwo = yield* acquireTestRuntime(layer);
          const machine = makePingMachine(observedResourceIds);
          const actorOne = makeActor(machine, { runtime: runtimeOne });
          const actorTwo = makeActor(machine, { runtime: runtimeTwo });
          const fiberOne = actorOne.start();
          const fiberTwo = actorTwo.start();
          yield* actorOne.ready();
          yield* actorTwo.ready();

          const handleOne = yield* actorOne.getHandle();
          const handleTwo = yield* actorTwo.getHandle();
          yield* handleOne.commands.ping();
          yield* handleTwo.commands.ping();

          expect(events).toEqual(['acquire:1', 'acquire:2']);
          expect(observedResourceIds).toEqual([1, 2]);
          yield* Fiber.interrupt(fiberOne);
          yield* Fiber.interrupt(fiberTwo);
        }),
      );

      expect(events).toHaveLength(4);
      expect(events).toEqual(
        expect.arrayContaining([
          'acquire:1',
          'acquire:2',
          'release:1',
          'release:2',
        ]),
      );
    }),
  );

  it.effect(
    'fails readiness and the owner Fiber when Layer acquisition fails',
    () =>
      Effect.gen(function* () {
        const events: Array<string> = [];
        const originalCause = Cause.fail('layer-acquisition-failed' as const);
        const failingLayer = Layer.effectDiscard(
          Effect.gen(function* () {
            yield* ActorResource;
            return yield* Effect.failCause(originalCause);
          }),
        ).pipe(Layer.provideMerge(makeTrackedLayer(events)));

        yield* Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* acquireTestRuntime(failingLayer);
            const actor = makeActor(makePingMachine([]), { runtime });
            const actorFiber = actor.start();
            const readyExit = yield* Effect.exit(actor.ready());
            const fiberExit = yield* Fiber.await(actorFiber);

            expect(Exit.isFailure(readyExit)).toBe(true);
            expect(Exit.isFailure(fiberExit)).toBe(true);
            if (!Exit.isFailure(readyExit) || !Exit.isFailure(fiberExit)) {
              throw new Error('Expected runtime acquisition failure');
            }
            expect(Cause.squash(readyExit.cause)).toBe(
              'layer-acquisition-failed',
            );
            expect(Cause.squash(fiberExit.cause)).toBe(
              'layer-acquisition-failed',
            );
            expect(readyExit.cause).toBe(fiberExit.cause);
            expect(readyExit.cause).toBe(originalCause);
            expect(() => actor.start()).toThrowError(
              new TypeError('MachineActor has already been started'),
            );
            yield* Fiber.interrupt(actorFiber);
          }),
        );

        expect(events).toEqual(['acquire:1', 'release:1']);
      }),
  );

  it.effect('keeps the shared Layer alive across Actor interruption', () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const observedResourceIds: Array<number> = [];

      yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquireTestRuntime(makeTrackedLayer(events));
          const machine = makePingMachine(observedResourceIds);
          const actorOne = makeActor(machine, { runtime });
          const actorTwo = makeActor(machine, { runtime });
          const fiberOne = actorOne.start();
          const fiberTwo = actorTwo.start();
          yield* actorOne.ready();
          yield* actorTwo.ready();

          yield* Fiber.interrupt(fiberOne);
          expect(events).toEqual(['acquire:1']);

          const handleTwo = yield* actorTwo.getHandle();
          yield* handleTwo.commands.ping();
          expect(observedResourceIds).toEqual([1]);

          yield* Fiber.interrupt(fiberTwo);
          expect(events).toEqual(['acquire:1']);
        }),
      );

      expect(events).toEqual(['acquire:1', 'release:1']);
    }),
  );
});
