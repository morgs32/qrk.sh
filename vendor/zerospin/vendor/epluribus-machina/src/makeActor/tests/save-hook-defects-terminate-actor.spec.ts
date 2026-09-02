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

const Working = makeState({
  stateName: 'working',
  input: { revision: Schema.Int },
});
const Done = makeState({
  stateName: 'done',
  input: { revision: Schema.Int },
});

const readFailureCause = (
  exit: Exit.Exit<unknown, unknown>,
): Cause.Cause<unknown> => {
  if (!Exit.isFailure(exit)) {
    throw new Error('Expected failure Cause');
  }
  return exit.cause;
};

const expectExactCause = (
  exit: Exit.Exit<unknown, unknown>,
  cause: Cause.Cause<unknown>,
): void => {
  expect(readFailureCause(exit)).toBe(cause);
};

describe('MachineActor terminal defects', () => {
  it.effect(
    'terminates on a Command save defect without publishing its destination',
    () =>
      Effect.gen(function* () {
        const defect = new Error('command-save-defect');
        const originalCause = Cause.die(defect);
        const initial = Working.make({ revision: 0 });
        const subscriberReady = yield* Deferred.make<void>();
        const observed: string[] = [];
        let commandStarts = 0;
        let saveCalls = 0;
        let programDestination: ReturnType<typeof Done.make> | undefined;
        const machine = makeMachine({
          states: { working: Working, done: Done },
          initial,
          routes: {
            working: {
              commands: {
                finish: {
                  payload: Schema.Void,
                  program: Effect.fn('working.finish')(({ origin }) =>
                    Effect.sync(() => {
                      commandStarts += 1;
                      programDestination = Done.make({
                        revision: origin.revision + 1,
                      });
                      return programDestination;
                    }),
                  ),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, {
          runtime,
          save: ({ origin, destination }) => {
            saveCalls += 1;
            expect(origin).toBe(initial);
            expect(destination).toBe(programDestination);
            return Effect.failCause(originalCause);
          },
        });
        const subscriber = yield* actor.handleStream.pipe(
          Stream.tap(handle =>
            Effect.gen(function* () {
              observed.push(handle.stateName);
              yield* Deferred.succeed(subscriberReady, undefined);
            }),
          ),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(subscriberReady);
        const actorFiber = actor.start();
        yield* actor.ready();
        const working = yield* actor.getHandle();
        if (working.stateName !== 'working') {
          return yield* Effect.die(new Error('Expected working'));
        }
        const activeTermination = yield* Fiber.await(actorFiber).pipe(
          Effect.forkChild({ startImmediately: true }),
        );

        const commandExit = yield* Effect.exit(working.commands.finish());
        const activeTerminationExit = yield* Fiber.join(activeTermination);
        const lateTerminationExit = yield* Fiber.await(actorFiber);
        const laterCommandExit = yield* Effect.exit(working.commands.finish());

        const terminalCause = readFailureCause(activeTerminationExit);
        expect(terminalCause).toBe(originalCause);
        expect(Cause.squash(terminalCause)).toBe(defect);
        expectExactCause(commandExit, terminalCause);
        expectExactCause(lateTerminationExit, terminalCause);
        expectExactCause(laterCommandExit, terminalCause);
        expect(commandStarts).toBe(1);
        expect(saveCalls).toBe(1);
        expect(yield* actor.getHandle()).toBe(working);
        expect(observed).toEqual(['working']);
        expect(subscriber.pollUnsafe()).toBeUndefined();
        expect(() => actor.start()).toThrowError(
          new TypeError('MachineActor has already been started'),
        );

        yield* Fiber.interrupt(actorFiber);
        yield* Fiber.interrupt(subscriber);
      }),
  );

  it.effect(
    'terminates on an onActivation save defect without publishing its destination',
    () =>
      Effect.gen(function* () {
        const saveStarted = yield* Deferred.make<void>();
        const defect = new Error('activation-save-defect');
        const originalCause = Cause.die(defect);
        const initial = Working.make({ revision: 0 });
        const subscriberReady = yield* Deferred.make<void>();
        const observed: string[] = [];
        let commandStarts = 0;
        let saveCalls = 0;
        let programDestination: ReturnType<typeof Done.make> | undefined;
        const machine = makeMachine({
          states: { working: Working, done: Done },
          initial,
          routes: {
            working: {
              onActivation: Effect.fn('working.onActivation')(({ origin }) =>
                Effect.sync(() => {
                  programDestination = Done.make({
                    revision: origin.revision + 1,
                  });
                  return programDestination;
                }),
              ),
              commands: {
                finish: {
                  payload: Schema.Void,
                  program: Effect.fn('working.finish')(() =>
                    Effect.sync(() => {
                      commandStarts += 1;
                      return Done.make({ revision: 1 });
                    }),
                  ),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, {
          runtime,
          save: Effect.fn('saveActivationDestination')(function* ({
            origin,
            destination,
          }) {
            saveCalls += 1;
            expect(origin).toBe(initial);
            expect(destination).toBe(programDestination);
            yield* Deferred.succeed(saveStarted, undefined);
            return yield* Effect.failCause(originalCause);
          }),
        });
        const subscriber = yield* actor.handleStream.pipe(
          Stream.tap(handle =>
            Effect.gen(function* () {
              observed.push(handle.stateName);
              yield* Deferred.succeed(subscriberReady, undefined);
            }),
          ),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(subscriberReady);
        const actorFiber = actor.start();
        const activeTermination = yield* Fiber.await(actorFiber).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        yield* actor.ready();
        yield* Deferred.await(saveStarted);
        const working = yield* actor.getHandle();
        if (working.stateName !== 'working') {
          return yield* Effect.die(new Error('Expected working'));
        }

        const activeTerminationExit = yield* Fiber.join(activeTermination);
        const lateTerminationExit = yield* Fiber.await(actorFiber);
        const laterCommandExit = yield* Effect.exit(working.commands.finish());

        const terminalCause = readFailureCause(activeTerminationExit);
        expect(Cause.squash(terminalCause)).toBe(defect);
        expectExactCause(lateTerminationExit, terminalCause);
        expectExactCause(laterCommandExit, terminalCause);
        expect(commandStarts).toBe(0);
        expect(saveCalls).toBe(1);
        expect(yield* actor.getHandle()).toBe(working);
        expect(observed).toEqual(['working']);

        yield* Fiber.interrupt(actorFiber);
        yield* Fiber.interrupt(subscriber);
      }),
  );

  it.effect(
    'preserves an onActivation defect completed behind a Command holding the gate',
    () =>
      Effect.gen(function* () {
        const activationReady = yield* Deferred.make<void>();
        const releaseActivation = yield* Deferred.make<void>();
        const activationExited = yield* Deferred.make<void>();
        const commandStarted = yield* Deferred.make<void>();
        const releaseCommand = yield* Deferred.make<void>();
        const defect = new Error('activation-defect-behind-command');
        const originalCause = Cause.die(defect);
        const initial = Working.make({ revision: 0 });
        let commandStarts = 0;
        let saveCalls = 0;
        const machine = makeMachine({
          states: { working: Working },
          initial,
          routes: {
            working: {
              onActivation: Effect.fn('working.onActivation')(({ origin }) => {
                if (origin.revision !== 0) {
                  return Effect.never;
                }
                return Effect.gen(function* () {
                  yield* Deferred.succeed(activationReady, undefined);
                  yield* Deferred.await(releaseActivation);
                  return yield* Effect.failCause(originalCause);
                }).pipe(
                  Effect.onExit(() =>
                    Deferred.succeed(activationExited, undefined).pipe(
                      Effect.asVoid,
                    ),
                  ),
                );
              }),
              commands: {
                advance: {
                  payload: Schema.Void,
                  program: Effect.fn('working.advance')(function* ({ origin }) {
                    commandStarts += 1;
                    yield* Deferred.succeed(commandStarted, undefined);
                    yield* Deferred.await(releaseCommand);
                    return Working.make({ revision: origin.revision + 1 });
                  }),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, {
          runtime,
          save: () =>
            Effect.sync(() => {
              saveCalls += 1;
            }),
        });
        const actorFiber = actor.start();
        yield* actor.ready();
        yield* Deferred.await(activationReady);
        const working = yield* actor.getHandle();
        if (working.stateName !== 'working') {
          return yield* Effect.die(new Error('Expected working'));
        }
        const activeTermination = yield* Fiber.await(actorFiber).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        const command = yield* working.commands
          .advance()
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(commandStarted);

        yield* Deferred.succeed(releaseActivation, undefined);
        yield* Deferred.await(activationExited);
        yield* Effect.yieldNow;
        yield* Deferred.succeed(releaseCommand, undefined);

        const commandExit = yield* Fiber.await(command);
        const terminalCause = readFailureCause(commandExit);
        expect(Cause.squash(terminalCause)).toBe(defect);
        const activeTerminationExit = yield* Fiber.join(activeTermination);
        const lateTerminationExit = yield* Fiber.await(actorFiber);
        const laterCommandExit = yield* Effect.exit(working.commands.advance());

        expectExactCause(activeTerminationExit, terminalCause);
        expectExactCause(lateTerminationExit, terminalCause);
        expectExactCause(laterCommandExit, terminalCause);
        expect(commandStarts).toBe(1);
        expect(saveCalls).toBe(0);
        expect(yield* actor.getHandle()).toBe(working);

        yield* Fiber.interrupt(actorFiber);
      }),
  );

  it.effect(
    'terminates on an onActivation program defect without invoking save',
    () =>
      Effect.gen(function* () {
        const activationStarted = yield* Deferred.make<void>();
        const defect = new Error('activation-program-defect');
        const originalCause = Cause.die(defect);
        const subscriberReady = yield* Deferred.make<void>();
        const observed: string[] = [];
        let commandStarts = 0;
        let saveCalls = 0;
        const machine = makeMachine({
          states: { working: Working, done: Done },
          initial: Working.make({ revision: 0 }),
          routes: {
            working: {
              onActivation: Effect.fn('working.onActivation')(function* () {
                yield* Deferred.succeed(activationStarted, undefined);
                return yield* Effect.failCause(originalCause);
              }),
              commands: {
                finish: {
                  payload: Schema.Void,
                  program: Effect.fn('working.finish')(() =>
                    Effect.sync(() => {
                      commandStarts += 1;
                      return Done.make({ revision: 1 });
                    }),
                  ),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, {
          runtime,
          save: () =>
            Effect.sync(() => {
              saveCalls += 1;
            }),
        });
        const subscriber = yield* actor.handleStream.pipe(
          Stream.tap(handle =>
            Effect.gen(function* () {
              observed.push(handle.stateName);
              yield* Deferred.succeed(subscriberReady, undefined);
            }),
          ),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(subscriberReady);
        const actorFiber = actor.start();
        const activeTermination = yield* Fiber.await(actorFiber).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        yield* actor.ready();
        yield* Deferred.await(activationStarted);
        const working = yield* actor.getHandle();
        if (working.stateName !== 'working') {
          return yield* Effect.die(new Error('Expected working'));
        }

        const activeTerminationExit = yield* Fiber.join(activeTermination);
        const lateTerminationExit = yield* Fiber.await(actorFiber);
        const laterCommandExit = yield* Effect.exit(working.commands.finish());

        const terminalCause = readFailureCause(activeTerminationExit);
        expect(Cause.squash(terminalCause)).toBe(defect);
        expectExactCause(lateTerminationExit, terminalCause);
        expectExactCause(laterCommandExit, terminalCause);
        expect(commandStarts).toBe(0);
        expect(saveCalls).toBe(0);
        expect(yield* actor.getHandle()).toBe(working);
        expect(observed).toEqual(['working']);

        yield* Fiber.interrupt(actorFiber);
        yield* Fiber.interrupt(subscriber);
      }),
  );
});
