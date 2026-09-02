import type { Effect, Fiber, Schema, Stream } from 'effect';

import type { StateInactive } from './StateInactive.js';

type IExact<EXPECTED, ACTUAL> = EXPECTED extends unknown
  ? ACTUAL extends EXPECTED
    ? EXPECTED extends object
      ? ACTUAL extends object
        ? ACTUAL & Record<Exclude<keyof ACTUAL, keyof EXPECTED>, never>
        : never
      : ACTUAL
    : never
  : never;

type IMerge<LEFT, RIGHT> = {
  readonly [KEY in keyof LEFT | keyof RIGHT]: KEY extends keyof RIGHT
    ? RIGHT[KEY]
    : KEY extends keyof LEFT
      ? LEFT[KEY]
      : never;
};

export type { State } from './makeState/State.js';

export type IAnyState = {
  readonly stateName: string;
  readonly input: Schema.Struct.Fields;
  readonly schema: Schema.Constraint;
  readonly make: (fields: never) => unknown;
};

export type IStateMap = Readonly<Record<string, IAnyState>>;

export type InferStateValue<STATE> = STATE extends {
  readonly stateName: infer NAME extends string;
  readonly input: infer FIELDS extends Schema.Struct.Fields;
}
  ? IMerge<{ readonly stateName: NAME }, Schema.Struct.Type<FIELDS>>
  : never;

export type InferStateName<STATE> = STATE extends {
  readonly stateName: infer NAME extends string;
}
  ? NAME
  : InferStateValue<STATE> extends {
        readonly stateName: infer NAME extends string;
      }
    ? NAME
    : never;

export type IMachine<
  STATES extends IStateMap = IStateMap,
  INITIAL extends InferStateValue<STATES[keyof STATES]> = InferStateValue<
    STATES[keyof STATES]
  >,
  ROUTES = Readonly<Record<string, unknown>>
> = {
  readonly states: STATES;
  readonly initial: INITIAL;
  readonly routes: ROUTES;
};

export type InferRegisteredState<MACHINE> = MACHINE extends IMachine<
  infer STATES,
  any,
  any
>
  ? STATES[keyof STATES]
  : never;

export type InferMachineValue<MACHINE> = InferStateValue<
  InferRegisteredState<MACHINE>
>;

type InferProgramServices<PROGRAM> = PROGRAM extends (
  ...args: any[]
) => Effect.Effect<any, any, infer SERVICES>
  ? SERVICES
  : never;

type InferStateRouteServices<STATE_ROUTES> =
  | (STATE_ROUTES extends {
      readonly onActivation: infer PROGRAM;
    }
      ? InferProgramServices<PROGRAM>
      : never)
  | (STATE_ROUTES extends {
      readonly commands: infer COMMANDS;
    }
      ? {
          [COMMAND in keyof COMMANDS]: COMMANDS[COMMAND] extends {
            readonly program: infer PROGRAM;
          }
            ? InferProgramServices<PROGRAM>
            : never;
        }[keyof COMMANDS]
      : never);

export type InferMachineRouteServices<MACHINE> = MACHINE extends {
  readonly routes: infer ROUTES;
}
  ? {
      [STATE in keyof ROUTES]: InferStateRouteServices<ROUTES[STATE]>;
    }[keyof ROUTES]
  : never;

type InferMachineRoutes<MACHINE> = MACHINE extends IMachine<
  any,
  any,
  infer ROUTES
>
  ? ROUTES
  : never;

type InferMachineStateByName<
  MACHINE,
  NAME extends string
> = MACHINE extends IMachine<infer STATES, any, any>
  ? NAME extends keyof STATES
    ? STATES[NAME]
    : never
  : never;

type InferStateRoutes<MACHINE, STATE extends IAnyState> =
  InferStateName<STATE> extends keyof InferMachineRoutes<MACHINE>
    ? InferMachineRoutes<MACHINE>[InferStateName<STATE>]
    : never;

type InferStateCommands<MACHINE, STATE extends IAnyState> =
  InferStateRoutes<MACHINE, STATE> extends {
    readonly commands: infer COMMANDS;
  }
    ? COMMANDS
    : Readonly<Record<never, never>>;

type InferCommandPayloadSchema<COMMAND> = COMMAND extends {
  readonly payload: infer PAYLOAD extends Schema.Top;
}
  ? PAYLOAD
  : never;

type InferCommandPayload<COMMAND> = Schema.Schema.Type<
  InferCommandPayloadSchema<COMMAND>
>;

type InferCommandProgram<COMMAND> = COMMAND extends {
  readonly program: infer PROGRAM;
}
  ? PROGRAM
  : never;

type InferProgramSuccess<PROGRAM> = PROGRAM extends (
  ...args: any[]
) => Effect.Effect<infer SUCCESS, any, any>
  ? SUCCESS
  : never;

type InferProgramFailure<PROGRAM> = PROGRAM extends (
  ...args: any[]
) => Effect.Effect<any, infer FAILURE, any>
  ? FAILURE
  : never;

type InferProgramDestinationHandle<MACHINE, PROGRAM> =
  InferProgramSuccess<PROGRAM> extends infer VALUE
    ? VALUE extends { readonly stateName: infer NAME extends string }
      ? InferMachineStateByName<MACHINE, NAME> extends infer STATE
        ? STATE extends IAnyState
          ? InferStateHandle<MACHINE, STATE>
          : never
        : never
      : never
    : never;

type IIsVoidCommand<COMMAND> = [
  InferCommandPayloadSchema<COMMAND>
] extends [typeof Schema.Void]
  ? [typeof Schema.Void] extends [InferCommandPayloadSchema<COMMAND>]
    ? true
    : false
  : false;

type IStateHandleCommand<MACHINE, COMMAND> =
  InferCommandProgram<COMMAND> extends infer PROGRAM
    ? PROGRAM extends (...args: any[]) => Effect.Effect<any, any, any>
      ? IIsVoidCommand<COMMAND> extends true
        ? () => Effect.Effect<
            InferProgramDestinationHandle<MACHINE, PROGRAM>,
            InferProgramFailure<PROGRAM> | StateInactive
          >
        : <const INPUT extends InferCommandPayload<COMMAND>>(
            payload: IExact<InferCommandPayload<COMMAND>, INPUT>
          ) => Effect.Effect<
            InferProgramDestinationHandle<MACHINE, PROGRAM>,
            InferProgramFailure<PROGRAM> | StateInactive
          >
      : never
    : never;

type IStateHandleCommands<MACHINE, COMMANDS> = COMMANDS extends object
  ? {
      readonly [COMMAND in keyof COMMANDS]: IStateHandleCommand<
        MACHINE,
        COMMANDS[COMMAND]
      >;
    }
  : Readonly<Record<never, never>>;

export type IStateHandle<
  MACHINE = IMachine<any, any, any>,
  STATE extends IAnyState = IAnyState
> = InferStateValue<STATE> & {
  readonly commands: IStateHandleCommands<
    MACHINE,
    InferStateCommands<MACHINE, STATE>
  >;
};

export type InferStateHandle<
  MACHINE,
  STATE extends IAnyState
> = IStateHandle<MACHINE, STATE>;

export type InferMachineStateHandle<MACHINE> =
  InferRegisteredState<MACHINE> extends infer STATE
    ? STATE extends IAnyState
      ? InferStateHandle<MACHINE, STATE>
      : never
    : never;

export interface IMachineActor<
  MACHINE extends IMachine<any, any, any>,
  RUNTIME_ERROR,
> {
  readonly getHandle: () => Effect.Effect<InferMachineStateHandle<MACHINE>>;
  readonly handleStream: Stream.Stream<InferMachineStateHandle<MACHINE>>;
  readonly start: () => Fiber.Fiber<never, RUNTIME_ERROR>;
  readonly ready: () => Effect.Effect<void, RUNTIME_ERROR>;
}

export type IRouteContractChannel = 'success' | 'failure';

export type IRouteContractIssue =
  | 'MissingStateName'
  | 'UnregisteredState'
  | 'SchemaFailure';

export type IRouteContractExpected = readonly string[] | Schema.Top;
