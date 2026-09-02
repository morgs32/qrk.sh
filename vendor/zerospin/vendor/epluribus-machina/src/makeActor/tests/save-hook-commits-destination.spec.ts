import { it } from '@effect/vitest';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schema,
  Scope,
  Stream,
} from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { RouteContractViolation } from '../../RouteContractViolation.js';
import { StateInactive } from '../../StateInactive.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Draft = makeState({
  stateName: 'draft',
  input: { revision: Schema.Int },
});
const Saved = makeState({
  stateName: 'saved',
  input: { revision: Schema.Int },
});
const Active = makeState({
  stateName: 'active',
  input: { revision: Schema.Int },
});

describe('MachineActor save hook commit', () => {
  it.effect(
    'cannot be interrupted between saving and publishing a Command destination',
    () =>
      Effect.gen(function* () {
        const subscriberReady = yield* Deferred.make<void>();
        const saveStarted = yield* Deferred.make<void>();
        const releaseSave = yield* Deferred.make<void>();
        const destinationPublished = yield* Deferred.make<void>();
        const events: string[] = [];
        const initial = Draft.make({ revision: 0 });
        let programDestination: ReturnType<typeof Saved.make> | undefined;
        let persisted: ReturnType<typeof Saved.make> | undefined;
        const machine = makeMachine({
          states: { draft: Draft, saved: Saved },
          initial,
          routes: {
            draft: {
              commands: {
                save: {
                  payload: Schema.Void,
                  program: Effect.fn('draft.save')(({ origin }) =>
                    Effect.sync(() => {
                      programDestination = Saved.make({
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
          save: Effect.fn('saveCommandDestination')(function* ({
            origin,
            destination,
          }) {
            expect(origin).toBe(initial);
            expect(destination).toBe(programDestination);
            events.push('save-started');
            yield* Deferred.succeed(saveStarted, undefined);
            yield* Deferred.await(releaseSave);
            persisted = destination;
            events.push('saved');
          }),
        });
        const subscriber = yield* actor.handleStream.pipe(
          Stream.tap(handle =>
            Effect.gen(function* () {
              if (handle.stateName === 'draft') {
                yield* Deferred.succeed(subscriberReady, undefined);
                return;
              }
              events.push('published');
              expect(persisted).toBe(programDestination);
              yield* Deferred.succeed(destinationPublished, undefined);
            }),
          ),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(subscriberReady);
        const actorFiber = actor.start();
        yield* actor.ready();
        const draft = yield* actor.getHandle();
        if (draft.stateName !== 'draft') {
          return yield* Effect.die(new Error('Expected draft'));
        }

        const command = yield* draft.commands
          .save()
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(saveStarted);

        command.interruptUnsafe();
        expect(yield* actor.getHandle()).toBe(draft);
        expect(events).toEqual(['save-started']);

        yield* Deferred.succeed(releaseSave, undefined);
        yield* Deferred.await(destinationPublished);
        const commandExit = yield* Fiber.await(command);

        expect(Exit.isFailure(commandExit)).toBe(true);
        if (Exit.isFailure(commandExit)) {
          expect(Cause.hasInterruptsOnly(commandExit.cause)).toBe(true);
        }
        expect(events).toEqual(['save-started', 'saved', 'published']);
        expect(yield* actor.getHandle()).toMatchObject({
          stateName: 'saved',
          revision: 1,
        });

        yield* Fiber.interrupt(subscriber);
        yield* Fiber.interrupt(actorFiber);
      }),
  );

  it.effect(
    'uses one fresh save Scope even when the runtime provides Scope',
    () =>
      Effect.gen(function* () {
        const outerScope = yield* Effect.scope;
        const saveScopes: Scope.Scope[] = [];
        let saveFinalizers = 0;
        const machine = makeMachine({
          states: { active: Active },
          initial: Active.make({ revision: 0 }),
          routes: {
            active: {
              commands: {
                refresh: {
                  payload: Schema.Void,
                  program: Effect.fn('active.refresh')(({ origin }) =>
                    Effect.succeed(
                      Active.make({ revision: origin.revision + 1 }),
                    ),
                  ),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(
          Layer.succeed(Scope.Scope, outerScope),
        );
        const actor = makeActor(machine, {
          runtime,
          save: Effect.fn('saveWithFreshScope')(function* () {
            saveScopes.push(yield* Effect.scope);
            yield* Effect.acquireRelease(Effect.void, () =>
              Effect.sync(() => {
                saveFinalizers += 1;
              }),
            );
          }),
        });
        const actorFiber = actor.start();
        yield* actor.ready();
        const initial = yield* actor.getHandle();
        if (initial.stateName !== 'active') {
          return yield* Effect.die(new Error('Expected active'));
        }

        const first = yield* initial.commands.refresh();
        const second = yield* first.commands.refresh();

        expect(second.revision).toBe(2);
        expect(saveScopes).toHaveLength(2);
        expect(saveScopes[0]).not.toBe(outerScope);
        expect(saveScopes[1]).not.toBe(outerScope);
        expect(saveScopes[0]).not.toBe(saveScopes[1]);
        expect(saveFinalizers).toBe(2);
        yield* Fiber.interrupt(actorFiber);
      }),
  );

  it.effect(
    'does not save typed failures, invalid successes, or stale Handle calls',
    () =>
      Effect.gen(function* () {
        const saves: Array<{
          readonly origin: {
            readonly stateName: string;
            readonly revision: number;
          };
          readonly destination: {
            readonly stateName: string;
            readonly revision: number;
          };
        }> = [];
        const machine = makeMachine({
          states: { active: Active },
          initial: Active.make({ revision: 0 }),
          routes: {
            active: {
              commands: {
                reject: {
                  payload: Schema.Void,
                  program: Effect.fn('active.reject')(function* () {
                    return yield* Effect.fail('rejected' as const);
                  }),
                },
                refresh: {
                  payload: Schema.Void,
                  program: Effect.fn('active.refresh')(({ origin }) =>
                    Effect.succeed(
                      Active.make({ revision: origin.revision + 1 }),
                    ),
                  ),
                },
                invalid: {
                  payload: Schema.Void,
                  program: Effect.fn('active.invalid')(() =>
                    Effect.succeed({
                      stateName: 'active',
                      revision: 'invalid',
                    } as never),
                  ),
                },
              },
            },
          },
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const actor = makeActor(machine, {
          runtime,
          save: ({ origin, destination }) =>
            Effect.sync(() => {
              saves.push({ origin, destination });
            }),
        });
        const actorFiber = actor.start();
        yield* actor.ready();
        const first = yield* actor.getHandle();
        if (first.stateName !== 'active') {
          return yield* Effect.die(new Error('Expected active'));
        }

        expect(yield* Effect.flip(first.commands.reject())).toBe('rejected');
        expect(saves).toHaveLength(0);

        const current = yield* first.commands.refresh();
        expect(saves).toHaveLength(1);
        expect(saves[0]).toEqual({
          origin: { stateName: 'active', revision: 0 },
          destination: { stateName: 'active', revision: 1 },
        });

        const stale = yield* Effect.flip(first.commands.refresh());
        expect(stale).toBeInstanceOf(StateInactive);
        expect(saves).toHaveLength(1);

        const invalidExit = yield* Effect.exit(current.commands.invalid());
        expect(Exit.isFailure(invalidExit)).toBe(true);
        if (Exit.isFailure(invalidExit)) {
          expect(Cause.squash(invalidExit.cause)).toBeInstanceOf(
            RouteContractViolation,
          );
        }
        expect(saves).toHaveLength(1);
        expect(yield* actor.getHandle()).toBe(current);
        yield* Fiber.interrupt(actorFiber);
      }),
  );

  it.effect('does not save a stale onActivation success', () =>
    Effect.gen(function* () {
      const automaticStarted = yield* Deferred.make<void>();
      const releaseAutomatic = yield* Deferred.make<void>();
      const automaticCompleted = yield* Deferred.make<void>();
      const commandStarted = yield* Deferred.make<void>();
      const releaseCommand = yield* Deferred.make<void>();
      const saves: Array<{
        readonly origin: {
          readonly stateName: string;
          readonly revision: number;
        };
        readonly destination: {
          readonly stateName: string;
          readonly revision: number;
        };
      }> = [];
      const initial = Active.make({ revision: 0 });
      const machine = makeMachine({
        states: { active: Active },
        initial,
        routes: {
          active: {
            onActivation: Effect.fn('active.onActivation')(function* ({
              origin,
            }) {
              if (origin.revision !== 0) {
                return yield* Effect.never;
              }
              yield* Deferred.succeed(automaticStarted, undefined);
              yield* Deferred.await(releaseAutomatic);
              yield* Deferred.succeed(automaticCompleted, undefined);
              return Active.make({ revision: 100 });
            }),
            commands: {
              refresh: {
                payload: Schema.Void,
                program: Effect.fn('active.refresh')(function* ({ origin }) {
                  yield* Deferred.succeed(commandStarted, undefined);
                  yield* Deferred.await(releaseCommand);
                  return Active.make({ revision: origin.revision + 1 });
                }),
              },
              probe: {
                payload: Schema.Void,
                program: Effect.fn('active.probe')(function* () {
                  return yield* Effect.fail('probed' as const);
                }),
              },
            },
          },
        },
      });
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, {
        runtime,
        save: ({ origin, destination }) =>
          Effect.sync(() => {
            saves.push({ origin, destination });
          }),
      });
      const actorFiber = actor.start();
      yield* actor.ready();
      yield* Deferred.await(automaticStarted);
      const first = yield* actor.getHandle();
      if (first.stateName !== 'active') {
        return yield* Effect.die(new Error('Expected active'));
      }

      const command = yield* first.commands
        .refresh()
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(commandStarted);
      yield* Deferred.succeed(releaseAutomatic, undefined);
      yield* Deferred.await(automaticCompleted);
      yield* Deferred.succeed(releaseCommand, undefined);
      const current = yield* Fiber.join(command);

      expect(yield* Effect.flip(current.commands.probe())).toBe('probed');
      expect(saves).toEqual([
        {
          origin: { stateName: 'active', revision: 0 },
          destination: { stateName: 'active', revision: 1 },
        },
      ]);
      expect(yield* actor.getHandle()).toBe(current);
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
