import { it } from '@effect/vitest';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
  Stream,
} from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Running = makeState({
  stateName: 'running',
  input: {},
});
const Finished = makeState({
  stateName: 'finished',
  input: {},
});
/*
 * The Actor's owner Fiber owns background activation work. Interrupting that
 * Fiber stops the work and completes Actor cleanup.
 */
describe('MachineActor owner Fiber', () => {
  /*
   * 1. Start actor-owned work that never completes itself.
   * 2. Wait until that work is running.
   * 3. Interrupt the Actor's owner Fiber.
   * 4. Verify owned work stops and the Fiber completes.
   */
  it.effect('stops owned work when the owner Fiber is interrupted', () =>
    Effect.gen(function* () {
      const activationStarted = yield* Deferred.make<void>();
      const activationStopped = yield* Deferred.make<void>();
      const initial = Running.make({});
      const machine = makeMachine({
        states: { running: Running, finished: Finished },
        initial,
        routes: {
          running: {
            onActivation: Effect.fn('running.onActivation')(function* () {
              return yield* Effect.gen(function* () {
                yield* Deferred.succeed(activationStarted, undefined);
                return yield* Effect.never;
              }).pipe(
                Effect.ensuring(
                  Deferred.succeed(activationStopped, undefined).pipe(
                    Effect.asVoid,
                  ),
                ),
              );
            }),
          },
        },
      });
      // 1 — invoke a never-ending activation with an observable finalizer
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();
      // 2 — prove the activation is live before testing interruption
      yield* Deferred.await(activationStarted);

      // 3 — interrupting the owner Fiber must stop everything it owns
      yield* Fiber.interrupt(actorFiber);

      // 4 — the finalizer completes and the last Handle remains observable
      yield* Deferred.await(activationStopped);
      expect((yield* actor.getHandle()).stateName).toBe(
        'running',
      );
      expect(() => actor.start()).toThrow(TypeError);
    }),
  );

  it.effect('retains an activation cleanup defect in the owner Fiber', () =>
    Effect.gen(function* () {
      const activationStarted = yield* Deferred.make<void>();
      const cleanupDefect = new Error('activation-cleanup-defect');
      const cleanupCause = Cause.die(cleanupDefect);
      const machine = makeMachine({
        states: { running: Running },
        initial: Running.make({}),
        routes: {
          running: {
            onActivation: Effect.fn('running.cleanupDefect')(function* () {
              yield* Effect.acquireRelease(
                Deferred.succeed(activationStarted, undefined),
                () => Effect.failCause(cleanupCause),
              );
              return yield* Effect.never;
            }),
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();
      yield* Deferred.await(activationStarted);

      yield* Fiber.interrupt(actorFiber);
      const ownerExit = yield* Fiber.await(actorFiber);

      expect(Exit.isFailure(ownerExit)).toBe(true);
      if (!Exit.isFailure(ownerExit)) {
        throw new Error('Expected cleanup failure');
      }
      expect(Cause.squash(ownerExit.cause)).toBe(cleanupDefect);
      expect(Cause.hasInterrupts(ownerExit.cause)).toBe(true);
    }),
  );

  it.effect('fails readiness when its runtime was already disposed', () =>
    Effect.gen(function* () {
      let starts = 0;
      const initial = Running.make({});
      const machine = makeMachine({
        states: { running: Running, finished: Finished },
        initial,
        routes: {
          running: {
            onActivation: Effect.fn('running.onActivation')(function* () {
              starts += 1;
              return Finished.make({});
            }),
          },
        },
      });
      const runtime = ManagedRuntime.make(Layer.empty);
      yield* runtime.disposeEffect;
      const actor = makeActor(machine, { runtime });
      const initialHandle = yield* actor.getHandle();
      const actorFiber = actor.start();
      const readyExit = yield* Effect.exit(actor.ready());
      const fiberExit = yield* Fiber.await(actorFiber);

      expect(Exit.isFailure(readyExit)).toBe(true);
      expect(Exit.isFailure(fiberExit)).toBe(true);
      expect(starts).toBe(0);
      expect(yield* actor.getHandle()).toBe(initialHandle);
      expect(() => actor.start()).toThrow(TypeError);
    }),
  );

  /*
   * 1. Hold a Command program while it owns the Actor's transition turn.
   * 2. Interrupt the owner Fiber and let cleanup mark the Actor Closing.
   * 3. Release the Command program.
   * 4. Verify its post-program status check rejects the stale commit.
   * 5. Verify shutdown completes without publishing a transient destination.
   */
  it.effect('rejects an in-flight Command before shutdown can commit', () =>
    Effect.gen(function* () {
      const commandStarted = yield* Deferred.make<void>();
      const releaseCommand = yield* Deferred.make<void>();
      const closeStarted = yield* Deferred.make<void>();
      const initial = Running.make({});
      const machine = makeMachine({
        states: { running: Running, finished: Finished },
        initial,
        routes: {
          running: {
            commands: {
              finish: {
                payload: Schema.Void,
                program: Effect.fn('running.finish')(function* () {
                  yield* Deferred.succeed(commandStarted, undefined);
                  yield* Deferred.await(releaseCommand);
                  return Finished.make({});
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
      const running = yield* actor.getHandle();
      if (running.stateName !== 'running') {
        return yield* Effect.die(new Error('Expected running'));
      }

      // 1 — the Command now holds the transition gate
      const commandFiber = yield* running.commands
        .finish()
        .pipe(Effect.exit, Effect.forkChild);
      yield* Deferred.await(commandStarted);

      // 2 — interruption starts the Actor's ordered cleanup
      const closeFiber = yield* Effect.gen(function* () {
        yield* Deferred.succeed(closeStarted, undefined);
        yield* Fiber.interrupt(actorFiber);
      }).pipe(Effect.forkChild);
      yield* Deferred.await(closeStarted);
      yield* Effect.yieldNow;

      // 3 — cleanup has marked the Actor Closing before the Command resumes
      yield* Deferred.succeed(releaseCommand, undefined);
      const commandExit = yield* Fiber.join(commandFiber);

      // 4 — the Command cannot commit after shutdown admission
      expect(Exit.isFailure(commandExit)).toBe(true);
      if (!Exit.isFailure(commandExit)) {
        throw new Error('Expected closing Actor to reject the Command');
      }
      expect(Cause.squash(commandExit.cause)).toMatchObject({
        message: 'MachineActor is outside its owning Scope',
      });

      // 5 — shutdown completes and the original Handle remains current
      yield* Fiber.join(closeFiber);
      expect((yield* actor.getHandle()).stateName).toBe(
        'running',
      );
    }),
  );

  it.effect('finalizes activation-scoped resources before committing', () =>
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<void>();
      const releaseProgram = yield* Deferred.make<void>();
      const finalized = yield* Deferred.make<void>();
      const initial = Running.make({});
      const machine = makeMachine({
        states: { running: Running, finished: Finished },
        initial,
        routes: {
          running: {
            onActivation: Effect.fn('running.onActivation')(function* () {
              yield* Effect.acquireRelease(
                Deferred.succeed(acquired, undefined),
                () =>
                  Deferred.succeed(finalized, undefined).pipe(Effect.asVoid),
              );
              yield* Deferred.await(releaseProgram);
              return Finished.make({});
            }),
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();
      yield* Deferred.await(acquired);

      expect(yield* Deferred.isDone(finalized)).toBe(false);
      yield* Deferred.succeed(releaseProgram, undefined);
      yield* actor.handleStream.pipe(
        Stream.filter(handle => handle.stateName === 'finished'),
        Stream.take(1),
        Stream.runDrain,
      );

      yield* Deferred.await(finalized);
      expect((yield* actor.getHandle()).stateName).toBe(
        'finished',
      );
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
