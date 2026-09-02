import { it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { StateInactive } from '../../StateInactive.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Pending = makeState({
  stateName: 'pending',
  input: {},
});
const Complete = makeState({
  stateName: 'complete',
  input: {},
});
/*
 * Independent callers cannot execute actor commands concurrently. One command
 * owns the actor turn; a waiting call rechecks its Handle after that turn.
 */
describe('MachineActor independent command calls', () => {
  /*
   * 1. Hold the first command inside its Route.
   * 2. Start a command through the current Handle.
   * 3. Start an independent command through the same Handle.
   * 4. Release the first command to commit its destination.
   * 5. Verify the waiting command rechecks and fails as stale.
   */
  it.effect('serializes independent command calls', () =>
    Effect.gen(function* () {
      // 1 — Deferred gates expose when the first Route owns the actor turn
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      let starts = 0;
      const initial = Pending.make({});
      const machine = makeMachine({
        states: { pending: Pending, complete: Complete },
        initial,
        routes: {
          pending: {
            commands: {
              complete: {
                payload: Schema.Void,
                program: Effect.fn('pending.complete')(function* () {
                  starts += 1;
                  yield* Deferred.succeed(firstStarted, undefined);
                  yield* Deferred.await(releaseFirst);
                  return Complete.make({});
                }),
              },
            },
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();
      const pending = yield* actor.getHandle();
      if (pending.stateName !== 'pending') {
        return yield* Effect.die(new Error('Expected pending'));
      }

      // 2 — the first caller enters the Route while holding the actor turn
      const first = yield* Effect.forkChild(pending.commands.complete());
      yield* Deferred.await(firstStarted);
      // 3 — the second independent caller must wait for the same actor turn
      const waiting = yield* Effect.forkChild(pending.commands.complete());
      // 4 — releasing the first caller lets it commit Complete
      yield* Deferred.succeed(releaseFirst, undefined);

      // 5 — the waiter resumes, sees pending is stale, and never starts Route
      expect((yield* Fiber.join(first)).stateName).toBe('complete');
      const inactive = yield* Effect.flip(Fiber.join(waiting));
      expect(inactive).toBeInstanceOf(StateInactive);
      expect(starts).toBe(1);
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
