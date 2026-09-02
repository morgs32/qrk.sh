import { it } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Draft = makeState({
  stateName: 'draft',
  input: { value: Schema.String },
});
const Saved = makeState({
  stateName: 'saved',
  input: { value: Schema.String },
});
/*
 * A command invoked through the current Handle executes its Route and commits
 * the returned destination as the actor's new current Handle.
 */
describe('MachineActor command transition', () => {
  it.effect('defects before start without invoking the command Route', () =>
    Effect.gen(function* () {
      let starts = 0;
      const initial = Draft.make({ value: 'draft' });
      const machine = makeMachine({
        states: { draft: Draft, saved: Saved },
        initial,
        routes: {
          draft: {
            commands: {
              save: {
                payload: Schema.Struct({ suffix: Schema.String }),
                program: Effect.fn('draft.save')(function* ({
                  origin,
                  payload,
                }) {
                  starts += 1;
                  return Saved.make({
                    value: `${origin.value}-${payload.suffix}`,
                  });
                }),
              },
            },
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const draft = yield* actor.getHandle();
      if (draft.stateName !== 'draft') {
        return yield* Effect.die(new Error('Expected draft'));
      }

      const preStartExit = yield* Effect.exit(
        draft.commands.save({ suffix: 'before-start' }),
      );

      expect(Exit.isFailure(preStartExit)).toBe(true);
      if (!Exit.isFailure(preStartExit)) {
        throw new Error('Expected pre-start command defect');
      }
      const defect = Cause.squash(preStartExit.cause);
      expect(defect).toBeInstanceOf(TypeError);
      expect(defect).toMatchObject({
        message: 'MachineActor has not been started',
      });
      expect(starts).toBe(0);
      expect(yield* actor.getHandle()).toBe(draft);

      const actorFiber = actor.start();
      yield* actor.ready();
      const saved = yield* draft.commands.save({ suffix: 'after-start' });

      expect(starts).toBe(1);
      expect(saved).toMatchObject({
        stateName: 'saved',
        value: 'draft-after-start',
      });
      expect(yield* actor.getHandle()).toBe(saved);
      yield* Fiber.interrupt(actorFiber);
    }),
  );

  /*
   * 1. Create the command's origin state.
   * 2. Start an actor with the command Route implementation.
   * 3. Obtain and narrow the current Handle.
   * 4. Invoke the command through that Handle.
   * 5. Verify the returned destination was committed.
   */
  it.effect(
    'invokes a current Handle command Route and commits its destination',
    () =>
      Effect.gen(function* () {
        // 1 — construct the draft origin consumed by the save Route
        const initial = Draft.make({ value: 'draft' });
        const machine = makeMachine({
          states: { draft: Draft, saved: Saved },
          initial,
          routes: {
            draft: {
              commands: {
                save: {
                  payload: Schema.Struct({ suffix: Schema.String }),
                  program: Effect.fn('draft.save')(function* ({
                    origin,
                    payload,
                  }) {
                    return Saved.make({
                      value: `${origin.value}-${payload.suffix}`,
                    });
                  }),
                },
              },
            },
          },
        });
        // 2 — acquire an Actor from the complete Machine definition
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, { runtime });
        const actorFiber = actor.start();
        yield* actor.ready();
        // 3 — read and narrow the current Handle to its draft command surface
        const draft = yield* actor.getHandle();
        if (draft.stateName !== 'draft') {
          return yield* Effect.die(new Error('Expected draft'));
        }

        // 4 — invoke save through the current Handle with its payload
        const saved = yield* draft.commands.save({ suffix: 'saved' });

        // 5 — the command result and actor state are the same Saved Handle
        expect(saved).toMatchObject({
          stateName: 'saved',
          value: 'draft-saved',
        });
        expect(yield* actor.getHandle()).toBe(saved);
        yield* Fiber.interrupt(actorFiber);
      }),
  );
});
