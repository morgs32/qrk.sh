import { it } from '@effect/vitest';
import { Context, Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMachine } from '../../makeMachine/makeMachine.js';
import { makeState } from '../../makeState/makeState.js';
import { makeActor } from '../makeActor.js';

import { acquireTestRuntime } from './acquireTestRuntime.js';

const Idle = makeState({
  stateName: 'idle',
  input: {},
});
const Done = makeState({
  stateName: 'done',
  input: {},
});
const initial = Idle.make({});
const machine = makeMachine({
  states: { idle: Idle, done: Done },
  initial,
  routes: {
    idle: {
      commands: {
        finish: {
          payload: Schema.Void,
          program: Effect.fn('idle.finish')(function* () {
            return Done.make({});
          }),
        },
      },
    },
  },
});

const makeActorUnsafe = (machine: unknown, props: unknown): unknown =>
  Reflect.apply(makeActor, undefined, [machine, props]);

const expectMachineSchemaDefect = <SERVICES, ERROR>(
  invalidMachine: unknown,
  layer: Layer.Layer<SERVICES, ERROR>,
): void => {
  const runtime = ManagedRuntime.make(layer);
  let defect: unknown;

  try {
    makeActorUnsafe(invalidMachine, { runtime });
  } catch (error) {
    defect = error;
  } finally {
    Effect.runSync(runtime.disposeEffect);
  }

  expect(Schema.isSchemaError(defect)).toBe(true);
};

describe('makeActor canonical Machine boundary', () => {
  it.effect('accepts the canonical Machine returned by makeMachine', () =>
    Effect.gen(function* () {
      const runtime = yield* acquireTestRuntime(Layer.empty);
      const actor = makeActor(machine, { runtime });

      expect(yield* actor.getHandle()).toMatchObject({
        stateName: 'idle',
      });
    }),
  );

  it('rejects spreads, plain structural copies, and wrong markers', () => {
    const invalidMachines = [
      { ...machine },
      { ...machine, states: { ...machine.states } },
      {
        _tag: 'Machine',
        states: machine.states,
        initial: machine.initial,
        routes: machine.routes,
      },
      { ...machine, _tag: 'WrongMachine' },
      Object.create(machine),
    ];

    for (const invalidMachine of invalidMachines) {
      expectMachineSchemaDefect(invalidMachine, Layer.empty);
    }
  });

  it('revalidates current own fields before Layer or Actor resource acquisition', () => {
    class Acquisition extends Context.Service<
      Acquisition,
      { readonly acquired: true }
    >()('makeActor-canonical-machine/Acquisition') {}

    const MutableIdle = makeState({
      stateName: 'mutable-idle',
      input: {},
    });
    const MutableDone = makeState({
      stateName: 'mutable-done',
      input: {},
    });
    const mutableMachine = makeMachine({
      states: {
        'mutable-idle': MutableIdle,
        'mutable-done': MutableDone,
      },
      initial: MutableIdle.make({}),
      routes: {
        'mutable-idle': {
          onActivation: Effect.fn('mutable-idle.onActivation')(function* () {
            yield* Acquisition;
            return MutableDone.make({});
          }),
        },
      },
    });
    let acquisitions = 0;
    const layer = Layer.effect(
      Acquisition,
      Effect.sync(() => {
        acquisitions += 1;
        return { acquired: true } as const;
      }),
    );

    Reflect.set(mutableMachine, 'routes', {});
    expectMachineSchemaDefect(mutableMachine, layer);
    expect(acquisitions).toBe(0);
  });

  it('strictly rejects excess own fields added after factory validation', () => {
    const changedMachine = makeMachine({
      states: { idle: Idle, done: Done },
      initial,
      routes: machine.routes,
    });

    Reflect.set(changedMachine, 'unexpected', true);
    expectMachineSchemaDefect(changedMachine, Layer.empty);
  });
});
