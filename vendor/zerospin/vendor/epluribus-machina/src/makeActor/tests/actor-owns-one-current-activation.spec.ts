import { it } from '@effect/vitest';
import { Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Idle = makeState({
  stateName: 'idle',
  input: { revision: Schema.Int },
});
const Done = makeState({
  stateName: 'done',
  input: { revision: Schema.Int },
});
/*
 * An actor owns exactly one current activation. Its current Handle is returned
 * as the current-first value published by handleStream.
 */
describe('MachineActor current activation', () => {
  /*
   * 1. Create the initial state.
   * 2. Start an actor from that state.
   * 3. Read the actor's current Handle.
   * 4. Observe the first published Handle.
   * 5. Verify both views expose the same activation.
   */
  it.effect('owns one current activation', () =>
    Effect.gen(function* () {
      // 1 — construct the initial idle state with revision zero
      const initial = Idle.make({ revision: 0 });
      const machine = makeMachine({
        states: { idle: Idle, done: Done },
        initial,
        routes: {
          idle: {
            commands: {
              finish: {
                payload: Schema.Void,
                program: Effect.fn('idle.finish')(function* () {
                  return Done.make({ revision: 1 });
                }),
              },
            },
          },
        },
      });
      // 2 — construct the actor from the complete Machine definition
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();

      // 3 — getHandle returns the single current activation
      const current = yield* actor.getHandle();
      // 4 — handleStream publishes that same activation first
      const observed = Array.from(
        yield* actor.handleStream.pipe(Stream.take(1), Stream.runCollect),
      );

      // 5 — both views share one exact Handle and command surface
      expect(observed).toEqual([current]);
      expect(current).toMatchObject({ stateName: 'idle', revision: 0 });
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
