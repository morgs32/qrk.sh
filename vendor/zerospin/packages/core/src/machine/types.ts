import type { Effect, Schema } from 'effect';

import type { IAnyAuthoredAggregate } from '../aggregate/types.ts';
import type {
  AggregateExecutedCommandSchema,
  ServiceExecutedCommandSchema,
} from '../contracts/CommandSchema.ts';
import type { IContract } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { ISelection } from '../models/make/makeActorDbVersion.ts';
import type { InferCommandPayload } from '../models/types.ts';
import type { IAnyService } from '../service/types.ts';

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
  : never;

/** The system registry owns the declaration; the source version is its pin. */
export type IAnyMachineDeclaration = Readonly<{
  source: IMachineSource;
  selections: IMachineSelections;
  contracts: IMachineContractBindings;
  states: IStateMap;
  routes: Readonly<Record<string, unknown>>;
  onBootstrap: unknown;
  onVersionChange?: unknown;
}>;

export type IAnyMachine = IAnyMachineDeclaration;
export type InferMachineValue<MACHINE extends IAnyMachine> =
  MACHINE['states'][keyof MACHINE['states']] extends infer STATE
    ? InferStateValue<STATE>
    : never;
export type IMachineSource = IAnyAuthoredAggregate | IAnyService;
export type IMachineSelections = Readonly<Record<string, ISelection>>;
export type IMachineContractBindings = Readonly<
  Record<string, Readonly<{ contract: IContract; target: IMachineSource }>>
>;
export type IMachineDb<SOURCE extends IMachineSource> = Readonly<
  Pick<IDb<IResourceDbConfig<SOURCE['models'], Record<never, never>>>, 'query'>
>;
export type IMachineOccurrence<SOURCE extends IMachineSource> =
  SOURCE extends IAnyAuthoredAggregate
    ?
        | typeof AggregateExecutedCommandSchema.Type
        | typeof ServiceExecutedCommandSchema.Type
    : typeof ServiceExecutedCommandSchema.Type;
export type IMachineCommandDescription<
  BINDINGS extends IMachineContractBindings,
> = {
  readonly [NAME in keyof BINDINGS & string]: Readonly<{
    binding: NAME;
    payload: InferCommandPayload<BINDINGS[NAME]['contract']['payload']>;
    claims?: Readonly<Record<string, unknown>>;
  }> &
    (BINDINGS[NAME]['target'] extends IAnyAuthoredAggregate
      ? Readonly<{ aggregateId: string }>
      : Readonly<{ aggregateId?: never }>);
}[keyof BINDINGS & string];
export type IMachinePushReceipt = Readonly<{
  commandId: string;
  accepted: true;
}>;
export type IMachineExecuteResult = Readonly<{
  commandId: string;
  admission: unknown;
  execution: unknown;
}>;

export type IStateRoute<
  ORIGIN,
  VALUE,
  DB,
  OCCURRENCE,
  BINDINGS extends IMachineContractBindings,
> = Readonly<{
  onCommand?: (props: {
    origin: ORIGIN;
    db: DB;
    command: OCCURRENCE;
  }) => VALUE | undefined;
}> &
  (
    | Readonly<{
        wakeAt: (props: { origin: ORIGIN }) => number;
        onWake: (props: { origin: ORIGIN; db: DB }) => VALUE;
        onActivation?: never;
        command?: never;
        onResult?: never;
      }>
    | Readonly<{
        onActivation: (props: {
          origin: ORIGIN;
        }) => Effect.Effect<VALUE, unknown, unknown>;
        wakeAt?: never;
        onWake?: never;
        command?: never;
        onResult?: never;
      }>
    | Readonly<{
        command: (props: {
          origin: ORIGIN;
        }) => IMachineCommandDescription<BINDINGS> &
          Readonly<{ mode: 'push' | 'execute' }>;
        onResult: (props: {
          origin: ORIGIN;
          db: DB;
          result: IMachinePushReceipt | IMachineExecuteResult;
        }) => VALUE;
        wakeAt?: never;
        onWake?: never;
        onActivation?: never;
      }>
    | Readonly<{
        wakeAt?: never;
        onWake?: never;
        onActivation?: never;
        command?: never;
        onResult?: never;
      }>
  );

type InferProgramServices<PROGRAM> = PROGRAM extends (
  ...args: never[]
) => Effect.Effect<unknown, unknown, infer SERVICES>
  ? SERVICES
  : never;
export type InferMachineServices<MACHINE extends IAnyMachine> = {
  readonly [STATE in keyof MACHINE['routes']]: MACHINE['routes'][STATE] extends {
    readonly onActivation: infer PROGRAM;
  }
    ? InferProgramServices<PROGRAM>
    : never;
}[keyof MACHINE['routes']];
