import { it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Waiting = makeState({
  stateName: 'waiting',
  input: { value: Schema.String },
});
const Ready = makeState({
  stateName: 'ready',
  input: { value: Schema.String },
});
/*
 * Entering a state starts its Activation Route. When that Route succeeds, its
 * returned destination becomes the actor's new current Handle.
 */
describe('MachineActor Activation Route', () => {
  /*
   * 1. Hold an Activation Route after it starts.
   * 2. Start the actor in the activating state.
   * 3. Subscribe for the destination Handle.
   * 4. Release the Activation Route to return its destination.
   * 5. Verify the destination was published and committed.
   */
  it.effect('commits an Activation Route destination', () =>
    Effect.gen(function* () {
      // 1 — Deferred gates make the background Activation Route observable
      const activationStarted = yield* Deferred.make<void>();
      const releaseActivation = yield* Deferred.make<void>();
      const initial = Waiting.make({ value: 'initial' });
      const machine = makeMachine({
        states: { waiting: Waiting, ready: Ready },
        initial,
        routes: {
          waiting: {
            onActivation: Effect.fn('waiting.onActivation')(function* ({
              origin,
            }) {
              yield* Deferred.succeed(activationStarted, undefined);
              yield* Deferred.await(releaseActivation);
              return Ready.make({ value: `${origin.value}-ready` });
            }),
          },
        },
      });
      // 2 — starting in Waiting launches Activate as actor-owned work
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();
      yield* Deferred.await(activationStarted);
      // 3 — listen before release so the Ready publication cannot be missed
      const readyHandle = yield* actor.handleStream.pipe(
        Stream.filter(handle => handle.stateName === 'ready'),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      );

      // 4 — let Activate return Ready and complete its transition
      yield* Deferred.succeed(releaseActivation, undefined);
      const observed = Array.from(yield* Fiber.join(readyHandle));

      // 5 — Ready is published once and is also the actor's current Handle
      expect(observed).toHaveLength(1);
      expect(observed[0]).toMatchObject({
        stateName: 'ready',
        value: 'initial-ready',
      });
      expect(yield* actor.getHandle()).toBe(observed[0]);
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
