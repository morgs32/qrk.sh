import { it } from '@effect/vitest';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schema,
  Stream,
} from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const A = makeState({
  stateName: 'a',
  input: {},
});
const B = makeState({
  stateName: 'b',
  input: {},
});
const C = makeState({
  stateName: 'c',
  input: {},
});
describe('explicit MachineActor start', () => {
  it.effect('checks ready when the returned Effect is evaluated', () =>
    Effect.gen(function* () {
      const machine = makeMachine({
        states: { a: A },
        initial: A.make({}),
        routes: {
          a: {
            onActivation: Effect.fn('a.stayActive')(() => Effect.never),
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });
      const readiness = actor.ready();

      const beforeStart = yield* Effect.exit(readiness);
      expect(Exit.isFailure(beforeStart)).toBe(true);
      if (!Exit.isFailure(beforeStart)) {
        throw new Error('Expected pre-start readiness to fail');
      }
      const beforeStartDefect = Cause.squash(beforeStart.cause);
      expect(beforeStartDefect).toBeInstanceOf(TypeError);
      expect((beforeStartDefect as Error).message).toBe(
        'MachineActor has not been started',
      );

      const actorFiber = actor.start();
      yield* readiness;
      yield* Fiber.interrupt(actorFiber);
    }),
  );

  it.effect(
    'returns start synchronously while runtime acquisition is blocked',
    () =>
      Effect.gen(function* () {
        const layerStarted = yield* Deferred.make<void>();
        const releaseLayer = yield* Deferred.make<void>();
        const machine = makeMachine({
          states: { a: A, b: B },
          initial: A.make({}),
          routes: {
            a: {
              commands: {
                advance: {
                  payload: Schema.Void,
                  program: Effect.fn('a.advance')(() =>
                    Effect.succeed(B.make({})),
                  ),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(
          Layer.effectDiscard(
            Effect.gen(function* () {
              yield* Deferred.succeed(layerStarted, undefined);
              yield* Deferred.await(releaseLayer);
            }),
          ),
        );
        const actor = makeActor(machine, { runtime });
        const initialHandle = yield* actor.getHandle();

        const actorFiber = actor.start();
        expect(() => actor.start()).toThrowError(
          new TypeError('MachineActor has already been started'),
        );
        yield* Deferred.await(layerStarted);
        const readyFiber = yield* actor
          .ready()
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Effect.yieldNow;
        expect(readyFiber.pollUnsafe()).toBeUndefined();

        if (initialHandle.stateName !== 'a') {
          return yield* Effect.die(new Error('Expected a'));
        }
        const commandExit = yield* Effect.exit(
          initialHandle.commands.advance(),
        );
        expect(Exit.isFailure(commandExit)).toBe(true);
        if (!Exit.isFailure(commandExit)) {
          throw new Error('Expected blocked-start Command to fail');
        }
        const commandDefect = Cause.squash(commandExit.cause);
        expect(commandDefect).toBeInstanceOf(TypeError);
        expect((commandDefect as Error).message).toBe(
          'MachineActor is not ready',
        );

        yield* Deferred.succeed(releaseLayer, undefined);
        yield* Fiber.join(readyFiber);
        expect((yield* initialHandle.commands.advance()).stateName).toBe('b');

        yield* Fiber.interrupt(actorFiber);
      }),
  );

  /*
   * 1. Construct an inert Actor whose current Handle is A.
   * 2. Subscribe and acknowledge the replayed A Handle.
   * 3. Start once and reject every later start synchronously.
   * 4. Observe the immediate A -> B -> C activation chain.
   * 5. Verify each onActivation program was invoked once and Handle identity is shared.
   */
  it.effect(
    'lets a ready subscriber observe startup and rejects repeated starts',
    () =>
      Effect.gen(function* () {
        let aStarts = 0;
        let bStarts = 0;
        const initial = A.make({});
        const machine = makeMachine({
          states: { a: A, b: B, c: C },
          initial,
          routes: {
            a: {
              onActivation: Effect.fn('a.onActivation')(function* () {
                aStarts += 1;
                return B.make({});
              }),
            },
            b: {
              onActivation: Effect.fn('b.onActivation')(function* () {
                bStarts += 1;
                return C.make({});
              }),
            },
          },
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, { runtime });
        const initialHandle = yield* actor.getHandle();
        const subscriberReady = yield* Deferred.make<void>();
        const startupHandles = yield* actor.handleStream.pipe(
          Stream.tap(handle =>
            handle === initialHandle
              ? Deferred.succeed(subscriberReady, undefined)
              : Effect.void,
          ),
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild,
        );

        yield* Deferred.await(subscriberReady);
        expect(aStarts).toBe(0);
        expect(bStarts).toBe(0);
        const actorFiber = actor.start();
        expect(() => actor.start()).toThrowError(
          new TypeError('MachineActor has already been started'),
        );
        yield* actor.ready();
        expect(() => actor.start()).toThrowError(
          new TypeError('MachineActor has already been started'),
        );
        const observed = Array.from(yield* Fiber.join(startupHandles));

        expect(observed.map(handle => handle.stateName)).toEqual([
          'a',
          'b',
          'c',
        ]);
        expect(observed[0]).toBe(initialHandle);
        expect(yield* actor.getHandle()).toBe(observed[2]);
        expect(aStarts).toBe(1);
        expect(bStarts).toBe(1);

        yield* Fiber.interrupt(actorFiber);
        expect(() => actor.start()).toThrowError(
          new TypeError('MachineActor has already been started'),
        );
      }),
  );

  it.effect('returns after registering blocked activation work', () =>
    Effect.gen(function* () {
      const activationStarted = yield* Deferred.make<void>();
      const releaseActivation = yield* Deferred.make<void>();
      const initial = A.make({});
      const machine = makeMachine({
        states: { a: A, b: B, c: C },
        initial,
        routes: {
          a: {
            onActivation: Effect.fn('a.onActivation')(function* () {
              yield* Deferred.await(releaseActivation);
              yield* Deferred.succeed(activationStarted, undefined);
              return B.make({});
            }),
          },
          b: {
            onActivation: Effect.fn('b.onActivation')(function* () {
              return C.make({});
            }),
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });

      const actorFiber = actor.start();
      yield* actor.ready();
      expect(yield* actor.getHandle()).toMatchObject({
        stateName: 'a',
      });

      yield* Deferred.succeed(releaseActivation, undefined);
      yield* Deferred.await(activationStarted);
      yield* actor.handleStream.pipe(
        Stream.filter(handle => handle.stateName === 'c'),
        Stream.take(1),
        Stream.runDrain,
      );
      expect(yield* actor.getHandle()).toMatchObject({
        stateName: 'c',
      });
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
