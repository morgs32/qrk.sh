import type { Effect, Schema } from 'effect';

import type {
  InferStateName,
  InferStateValue,
  IMachine,
  IStateMap
} from '../types.js';

import { makeMachineValue } from './makeMachineValue.js';

type ITypeError<MESSAGE extends string> = {
  readonly __typeError: MESSAGE;
};

type IRegisteredValue<STATES extends IStateMap> = InferStateValue<
  STATES[keyof STATES]
>;

type IAtLeastOneKey<VALUE> = {
  readonly [KEY in keyof VALUE]: {
    readonly [CURRENT in KEY]: unknown;
  };
}[keyof VALUE];

type IExactCommandRoute<COMMAND> = COMMAND extends object
  ? Record<Exclude<keyof COMMAND, 'payload' | 'program'>, never>
  : ITypeError<'Command Route must be an object'>;

type IExactCommands<COMMANDS> = COMMANDS extends object
  ? keyof COMMANDS extends never
    ? ITypeError<'commands must contain at least one Command Route'>
    : {
        readonly [COMMAND in keyof COMMANDS]: IExactCommandRoute<
          COMMANDS[COMMAND]
        >;
      }
  : ITypeError<'commands must be an object'>;

type IExactStateRoutes<STATE_ROUTES> = STATE_ROUTES extends object
  ? Record<
      Exclude<keyof STATE_ROUTES, 'onActivation' | 'commands'>,
      never
    > &
      ('commands' extends keyof STATE_ROUTES
        ? {
            readonly commands: IExactCommands<
              STATE_ROUTES['commands']
            >;
          }
        : unknown)
  : ITypeError<'State routes must be an object'>;

type IExactMachineRoutes<ROUTES> = {
  readonly [STATE in keyof ROUTES]: IExactStateRoutes<ROUTES[STATE]>;
};

type IMachineRoutesContext<STATES extends IStateMap, PAYLOADS> = {
  readonly [STATE in keyof PAYLOADS]: {
    readonly onActivation?: (request: {
      readonly origin: InferStateValue<
        STATES[STATE & keyof STATES]
      >;
    }) => Effect.Effect<IRegisteredValue<STATES>, never, any>;
    readonly commands?: {
      readonly [COMMAND in keyof PAYLOADS[STATE]]: {
        readonly payload: PAYLOADS[STATE][COMMAND] & Schema.Top;
        readonly program: (request: {
          readonly origin: InferStateValue<
            STATES[STATE & keyof STATES]
          >;
          readonly payload: Schema.Schema.Type<
            PAYLOADS[STATE][COMMAND] & Schema.Top
          >;
        }) => Effect.Effect<IRegisteredValue<STATES>, any, any>;
      };
    };
  } & (
    | { readonly onActivation: unknown }
    | { readonly commands: unknown }
  ) & (STATE extends keyof STATES
    ? unknown
    : ITypeError<'Route State must be registered by the Machine'>);
};

type IAssertStateMapKeys<STATES extends IStateMap> = Record<
  Exclude<keyof STATES, string>,
  never
> & {
  readonly [KEY in keyof STATES & string]: KEY extends InferStateName<
    STATES[KEY]
  >
    ? unknown
    : ITypeError<
        `State map key "${KEY}" must equal State name "${InferStateName<STATES[KEY]>}"`
      >;
};

type INonEmptyStateMap<STATES extends IStateMap> = keyof STATES extends never
  ? ITypeError<'State map must contain at least one State'>
  : unknown;

export function makeMachine<
  const STATES extends IStateMap,
  const INITIAL extends InferStateValue<
    NoInfer<STATES>[keyof NoInfer<STATES>]
  >,
  const PAYLOADS,
  const ROUTES
>(props: {
  readonly states: STATES &
    IAssertStateMapKeys<STATES> &
    INonEmptyStateMap<STATES>;
  readonly initial: INITIAL;
  readonly routes: IMachineRoutesContext<NoInfer<STATES>, PAYLOADS> &
    ROUTES &
    IAtLeastOneKey<NoInfer<STATES>> &
    IExactMachineRoutes<NoInfer<ROUTES>>;
}): IMachine<STATES, INITIAL, ROUTES> {
  const machine = makeMachineValue(props);

  // ALLOWED_CAST: makeMachineValue strictly decoded the complete definition
  // into the private canonical Machine class while this signature preserves
  // contextual Route inference.
  return machine as IMachine<STATES, INITIAL, ROUTES>;
}
