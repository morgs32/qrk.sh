import { it } from '@effect/vitest';
import { Cause, Context, Effect, Exit, Fiber, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import type { InferStateValue } from '../../types.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Pending = makeState({
  stateName: 'pending',
  input: { value: Schema.String },
});
const Complete = makeState({
  stateName: 'complete',
  input: { value: Schema.String },
});

class ApplicationService extends Context.Service<
  ApplicationService,
  { readonly prefix: string }
>()('machine-routes/ApplicationService') {}

const Alpha = makeState({
  stateName: 'alpha',
  input: {},
});
const Beta = makeState({
  stateName: 'beta',
  input: {},
});
const SharedDone = makeState({
  stateName: 'shared-done',
  input: { source: Schema.Literals(['alpha', 'beta']) },
});
type IAlpha = InferStateValue<typeof Alpha>;
type IBeta = InferStateValue<typeof Beta>;

describe('Machine Routes', () => {
  it.effect('uses Route services supplied by the shared runtime', () =>
    Effect.gen(function* () {
      const machine = makeMachine({
        states: { pending: Pending, complete: Complete },
        initial: Pending.make({ value: 'work' }),
        routes: {
          pending: {
            commands: {
              finish: {
                payload: Schema.Void,
                program: Effect.fn('pending.finish')(function* ({ origin }) {
                  const application = yield* ApplicationService;
                  return Complete.make({
                    value: `${application.prefix}${origin.value}`,
                  });
                }),
              },
            },
          },
        },
      });
      const runtime = yield* acquireTestRuntime(
        Layer.succeed(ApplicationService, { prefix: 'captured:' }),
      );
      const actor = makeActor(machine, { runtime });
      const actorFiber = actor.start();
      yield* actor.ready();
      const pending = yield* actor.getHandle();
      if (pending.stateName !== 'pending') {
        return yield* Effect.die(new Error('Expected pending'));
      }

      expect(yield* pending.commands.finish()).toMatchObject({
        stateName: 'complete',
        value: 'captured:work',
      });
      yield* Fiber.interrupt(actorFiber);
    }),
  );

  it.effect(
    'reuses one annotated program across decoded command placements',
    () =>
      Effect.gen(function* () {
        const origins: Array<string> = [];
        const finishProgram = Effect.fn('shared.finish')(function* (request: {
          readonly origin: IAlpha | IBeta;
          readonly payload: void;
        }) {
          origins.push(request.origin.stateName);
          return SharedDone.make({ source: request.origin.stateName });
        });
        const finish = { payload: Schema.Void, program: finishProgram };
        const states = {
          alpha: Alpha,
          beta: Beta,
          'shared-done': SharedDone,
        };
        const routes = {
          alpha: { commands: { finish } },
          beta: { commands: { finish } },
        };
        const alphaMachine = makeMachine({
          states,
          initial: Alpha.make({}),
          routes,
        });
        const betaMachine = makeMachine({
          states,
          initial: Beta.make({}),
          routes,
        });
        const runtime = yield* acquireTestRuntime(Layer.empty);
        const alphaActor = makeActor(alphaMachine, { runtime });
        const betaActor = makeActor(betaMachine, { runtime });
        const alphaFiber = alphaActor.start();
        const betaFiber = betaActor.start();
        yield* alphaActor.ready();
        yield* betaActor.ready();

        const alpha = yield* alphaActor.getHandle();
        const beta = yield* betaActor.getHandle();
        if (alpha.stateName !== 'alpha' || beta.stateName !== 'beta') {
          return yield* Effect.die(new Error('Expected alpha and beta'));
        }

        expect(alphaMachine.routes.alpha.commands.finish).not.toBe(finish);
        expect(betaMachine.routes.beta.commands.finish).not.toBe(finish);
        expect(alphaMachine.routes.alpha.commands.finish.payload).toBe(
          finish.payload,
        );
        expect(betaMachine.routes.beta.commands.finish.payload).toBe(
          finish.payload,
        );
        expect(alphaMachine.routes.alpha.commands.finish.program).toBe(
          finishProgram,
        );
        expect(betaMachine.routes.beta.commands.finish.program).toBe(
          finishProgram,
        );
        expect(yield* alpha.commands.finish()).toMatchObject({
          source: 'alpha',
        });
        expect(yield* beta.commands.finish()).toMatchObject({ source: 'beta' });
        expect(origins).toEqual(['alpha', 'beta']);
        yield* Fiber.interrupt(alphaFiber);
        yield* Fiber.interrupt(betaFiber);
      }),
  );

  it.effect(
    'propagates Command failures without changing the current Handle',
    () =>
      Effect.gen(function* () {
        const machine = makeMachine({
          states: { pending: Pending, complete: Complete },
          initial: Pending.make({ value: 'work' }),
          routes: {
            pending: {
              commands: {
                finish: {
                  payload: Schema.Void,
                  program: Effect.fn('pending.finish')(function* () {
                    return yield* Effect.fail('command-failed' as const);
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

        expect(yield* Effect.flip(pending.commands.finish())).toBe(
          'command-failed',
        );
        expect(yield* actor.getHandle()).toBe(pending);
        yield* Fiber.interrupt(actorFiber);
      }),
  );

  it.effect('rejects invalid payloads at their placement path', () =>
    Effect.gen(function* () {
      let starts = 0;
      const machine = makeMachine({
        states: { pending: Pending, complete: Complete },
        initial: Pending.make({ value: 'work' }),
        routes: {
          pending: {
            commands: {
              finish: {
                payload: Schema.Struct({ revision: Schema.Int }),
                program: Effect.fn('pending.finish')(function* () {
                  starts += 1;
                  return Complete.make({ value: 'done' });
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

      const unsafeInvocation = Reflect.apply(
        pending.commands.finish,
        undefined,
        [{ revision: 'wrong' }],
      ) as Effect.Effect<unknown>;
      const exit = yield* Effect.exit(unsafeInvocation);

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) {
        throw new Error('Expected invalid payload defect');
      }
      expect(Cause.squash(exit.cause)).toMatchObject({
        message:
          'MachineActor payload does not satisfy Command Route "pending.commands.finish"',
      });
      expect(starts).toBe(0);
      expect(yield* actor.getHandle()).toBe(pending);
      yield* Fiber.interrupt(actorFiber);
    }),
  );

  it.effect('preserves __proto__ Handle command keys', () =>
    Effect.gen(function* () {
      const PrototypeState = makeState({
        stateName: 'prototype-state',
        input: {},
      });
      const PrototypeDone = makeState({
        stateName: 'prototype-done',
        input: {},
      });
      const machine = makeMachine({
        states: {
          'prototype-state': PrototypeState,
          'prototype-done': PrototypeDone,
        },
        initial: PrototypeState.make({}),
        routes: {
          'prototype-state': {
            commands: {
              ['__proto__']: {
                payload: Schema.Void,
                program: Effect.fn('prototype-state.__proto__')(function* () {
                  return PrototypeDone.make({});
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
      const handle = yield* actor.getHandle();
      if (handle.stateName !== 'prototype-state') {
        return yield* Effect.die(new Error('Expected prototype-state'));
      }

      expect(Object.hasOwn(handle.commands, '__proto__')).toBe(true);
      expect(yield* handle.commands['__proto__']()).toMatchObject({
        stateName: 'prototype-done',
      });
      yield* Fiber.interrupt(actorFiber);
    }),
  );
});
