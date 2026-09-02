import { it } from '@effect/vitest';
import { Effect, Fiber, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { StateInactive } from '../../StateInactive.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Active = makeState({
  stateName: 'active',
  input: { revision: Schema.Int },
});
/*
 * Once a transition replaces a Handle, commands invoked through that old
 * Handle fail with StateInactive without invoking their Route.
 */
describe('MachineActor stale Handle', () => {
  /*
   * 1. Start an actor and count Route invocations.
   * 2. Capture its current Handle.
   * 3. Use that Handle to commit a replacement.
   * 4. Invoke the command again through the old Handle.
   * 5. Verify stale rejection occurs before Route invocation.
   */
  it.effect('fails an old Handle with StateInactive', () =>
    Effect.gen(function* () {
      // 1 — provide a refresh program whose counter exposes invocations
      let starts = 0;
      const initial = Active.make({ revision: 0 });
      const machine = makeMachine({
        states: { active: Active },
        initial,
        routes: {
          active: {
            commands: {
              refresh: {
                payload: Schema.Void,
                program: Effect.fn('active.refresh')(function* ({ origin }) {
                  starts += 1;
                  return Active.make({
                    revision: origin.revision + 1,
                  });
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
      // 2 — retain the first active Handle so it can become stale
      const old = yield* actor.getHandle();
      if (old.stateName !== 'active') {
        return yield* Effect.die(new Error('Expected active'));
      }

      // 3 — the first refresh replaces old with a new current Handle
      const current = yield* old.commands.refresh();
      // 4 — the second call through old must fail on activation identity
      const inactive = yield* Effect.flip(old.commands.refresh());

      // 5 — StateInactive arrives without a second Route start or state change
      expect(inactive).toBeInstanceOf(StateInactive);
      expect(inactive).toMatchObject({ state: 'active', current: 'active' });
      expect(yield* actor.getHandle()).toBe(current);
      expect(starts).toBe(1);
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
