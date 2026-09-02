import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeState } from '../makeState/makeState.js';
import { Machine } from './Machine.js';
import { Route } from './Route.js';
import { makeMachine } from './makeMachine.js';

const Alpha = makeState({
  stateName: 'alpha',
  input: { count: Schema.Int }
});

const Beta = makeState({
  stateName: 'beta',
  input: { count: Schema.Int }
});

const Terminal = makeState({
  stateName: 'terminal',
  input: { count: Schema.Int }
});

const AlphaInitial = Alpha.make({ count: 0 });

const makeUnsafe = (props: unknown): unknown =>
  Reflect.apply(makeMachine, undefined, [props]);

const expectSchemaFailure = (props: unknown): void => {
  let thrown: unknown;
  try {
    makeUnsafe(props);
  } catch (error) {
    thrown = error;
  }

  expect(Schema.isSchemaError(thrown)).toBe(true);
};

const makeDefaultRoutes = () => ({
  alpha: {
    commands: {
      advance: {
        payload: Schema.Void,
        program: Effect.fn('alpha.advance')(function* ({ origin }) {
          return Beta.make({ count: origin.count + 1 });
        })
      }
    }
  },
  beta: {
    onActivation: Effect.fn('beta.onActivation')(function* ({ origin }) {
      return Terminal.make({ count: origin.count + 1 });
    })
  }
});

describe('makeMachine', () => {
  it('returns a canonical Machine with decoded snapshots and retained leaves', () => {
    const states = { alpha: Alpha, beta: Beta, terminal: Terminal };
    const routes = makeDefaultRoutes();
    const advance = routes.alpha.commands.advance;
    const activation = routes.beta.onActivation;

    const machine = makeMachine({ states, initial: AlphaInitial, routes });

    expect(machine).toBeInstanceOf(Machine);
    expect(machine.routes.alpha).toBeInstanceOf(Route);
    expect(machine.routes.beta).toBeInstanceOf(Route);
    expect(Reflect.ownKeys(machine)).toEqual(['states', 'initial', 'routes']);
    expect(machine.states).not.toBe(states);
    expect(machine.routes).not.toBe(routes);
    expect(machine.initial).toBe(AlphaInitial);
    expect(machine.states.alpha).toBe(Alpha);
    expect(machine.states.beta).toBe(Beta);
    expect(machine.routes.alpha).not.toBe(routes.alpha);
    expect(machine.routes.alpha.commands).not.toBe(routes.alpha.commands);
    expect(machine.routes.alpha.commands.advance).not.toBe(advance);
    expect(machine.routes.alpha.commands.advance.payload).toBe(
      advance.payload
    );
    expect(machine.routes.alpha.commands.advance.program).toBe(
      advance.program
    );
    expect(machine.routes.beta.onActivation).toBe(activation);
  });

  it('retains a valid initial State and rejects invalid initial values', () => {
    const states = { alpha: Alpha, beta: Beta };
    const routes = {
      alpha: {
        commands: {
          advance: {
            payload: Schema.Void,
            program: Effect.fn('alpha.advance')(function* () {
              return Beta.make({ count: 1 });
            })
          }
        }
      }
    };

    expect(makeMachine({ states, initial: AlphaInitial, routes }).initial).toBe(
      AlphaInitial
    );
    expect(
      makeMachine({
        states,
        initial: { stateName: 'alpha', count: 0 },
        routes
      }).initial
    ).toEqual({ stateName: 'alpha', count: 0 });
    expectSchemaFailure({
      states,
      initial: { stateName: 'missing' },
      routes
    });
    expectSchemaFailure({
      states,
      initial: { stateName: 'alpha', count: 'zero' },
      routes
    });

    const initialWithExcess = Alpha.make({ count: 0 });
    Reflect.set(initialWithExcess, 'unexpected', true);
    expectSchemaFailure({ states, initial: initialWithExcess, routes });
  });

  it('requires a non-empty exact map of canonical State classes', () => {
    const activation = Effect.fn('alpha.onActivation')(function* () {
      return Beta.make({ count: 1 });
    });
    const routes = { alpha: { onActivation: activation } };
    const copiedAlpha = { ...Alpha };
    const WrongMarker = { ...Alpha };
    const ExtraState = makeState({
      stateName: 'extra',
      input: { count: Schema.Int }
    });
    Reflect.set(ExtraState, 'unexpected', true);

    for (const states of [
      null,
      {},
      { alpha: copiedAlpha, beta: Beta },
      { alpha: WrongMarker, beta: Beta },
      { alpha: Alpha, beta: Beta, extra: ExtraState },
      { wrong: Alpha, beta: Beta },
      { alpha: Alpha, beta: Beta, [Symbol('state')]: Terminal }
    ]) {
      expectSchemaFailure({ states, initial: AlphaInitial, routes });
    }
  });

  it('requires exact generated sparse Route shapes', () => {
    const states = { alpha: Alpha, beta: Beta };
    const activation = Effect.fn('alpha.onActivation')(function* () {
      return Beta.make({ count: 1 });
    });
    const command = {
      payload: Schema.Void,
      program: Effect.fn('alpha.advance')(function* () {
        return Beta.make({ count: 1 });
      })
    };
    const commandsWithSymbol = {
      advance: command,
      [Symbol('command')]: command
    };
    const cases: ReadonlyArray<unknown> = [
      null,
      {},
      { missing: { onActivation: activation } },
      { alpha: { onActivation: activation }, [Symbol('route')]: {} },
      { alpha: null },
      { alpha: {} },
      { alpha: { commands: {} } },
      { alpha: { onActivation: null } },
      { alpha: { onActivation: activation, unexpected: true } },
      { alpha: { commands: null } },
      { alpha: { commands: { advance: null } } },
      { alpha: { commands: { advance: { program: command.program } } } },
      {
        alpha: {
          commands: {
            advance: { payload: {}, program: command.program }
          }
        }
      },
      {
        alpha: {
          commands: {
            advance: { payload: Schema.Void, program: null }
          }
        }
      },
      {
        alpha: {
          commands: { advance: { ...command, unexpected: true } }
        }
      },
      { alpha: { commands: commandsWithSymbol } }
    ];

    for (const routes of cases) {
      expectSchemaFailure({ states, initial: AlphaInitial, routes });
    }

    expectSchemaFailure({
      states,
      initial: AlphaInitial,
      routes: { alpha: { onActivation: activation } },
      unexpected: true
    });
  });

  it('permits terminal and disconnected registered States', () => {
    const Disconnected = makeState({
      stateName: 'disconnected',
      input: {}
    });
    const machine = makeMachine({
      states: { alpha: Alpha, beta: Beta, disconnected: Disconnected },
      initial: AlphaInitial,
      routes: {
        alpha: {
          onActivation: Effect.fn('alpha.onActivation')(function* () {
            return Beta.make({ count: 1 });
          })
        }
      }
    });

    expect(machine.states.disconnected).toBe(Disconnected);
    expect(Object.hasOwn(machine.routes, 'disconnected')).toBe(false);
  });

  it('splits shared command wrappers while retaining Schema and program references', () => {
    const origins: Array<string> = [];
    const sharedProgram = Effect.fn('shared.advance')(function* (request: {
      readonly origin:
        | { readonly stateName: 'alpha'; readonly count: number }
        | { readonly stateName: 'beta'; readonly count: number };
      readonly payload: void;
    }) {
      origins.push(request.origin.stateName);
      return Terminal.make({ count: request.origin.count + 1 });
    });
    const sharedCommand = {
      payload: Schema.Void,
      program: sharedProgram
    };
    const routes = {
      alpha: { commands: { advance: sharedCommand } },
      beta: { commands: { advance: sharedCommand } }
    };
    const machine = makeMachine({
      states: { alpha: Alpha, beta: Beta, terminal: Terminal },
      initial: AlphaInitial,
      routes
    });
    const alphaCommand = machine.routes.alpha.commands.advance;
    const betaCommand = machine.routes.beta.commands.advance;

    expect(alphaCommand).not.toBe(sharedCommand);
    expect(betaCommand).not.toBe(sharedCommand);
    expect(alphaCommand).not.toBe(betaCommand);
    expect(alphaCommand.payload).toBe(sharedCommand.payload);
    expect(betaCommand.payload).toBe(sharedCommand.payload);
    expect(alphaCommand.program).toBe(sharedProgram);
    expect(betaCommand.program).toBe(sharedProgram);
    expect(origins).toEqual([]);
  });

  it('preserves __proto__ as an own Command key', () => {
    const machine = makeMachine({
      states: { alpha: Alpha, terminal: Terminal },
      initial: AlphaInitial,
      routes: {
        alpha: {
          commands: {
            ['__proto__']: {
              payload: Schema.Void,
              program: Effect.fn('alpha.__proto__')(function* () {
                return Terminal.make({ count: 1 });
              })
            }
          }
        }
      }
    });

    expect(
      Object.hasOwn(machine.routes.alpha.commands, '__proto__')
    ).toBe(true);
  });
});
