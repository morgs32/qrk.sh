import { Schema } from 'effect';

import { AggregateSchema } from '../../aggregate/make/makeAggregateVersion.js';
import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import { Model } from '../../models/defineModel.ts';
import { ServiceSchema } from '../../service/make/makeService.js';
import { MachineDeclaration } from '../MachineDeclaration.js';
import { decodeStateMap } from '../makeState/decodeStateMap.js';
import type {
  IMachineContractBindings,
  IMachineDb,
  IMachineOccurrence,
  IMachineSelections,
  IMachineSource,
  InferStateValue,
  IStateMap,
  IStateRoute,
} from '../types.js';

type IValue<STATES extends IStateMap> = InferStateValue<STATES[keyof STATES]>;
type IRoutes<
  STATES extends IStateMap,
  SOURCE extends IMachineSource,
  BINDINGS extends IMachineContractBindings,
> = Partial<{
  readonly [NAME in keyof STATES]: IStateRoute<
    InferStateValue<STATES[NAME]>,
    IValue<STATES>,
    IMachineDb<SOURCE>,
    IMachineOccurrence<SOURCE>,
    BINDINGS
  >;
}>;

export function makeMachine<
  const SOURCE extends IMachineSource,
  const SELECTIONS extends IMachineSelections,
  const BINDINGS extends IMachineContractBindings,
  const STATES extends IStateMap,
  const ROUTES extends IRoutes<STATES, SOURCE, BINDINGS>,
>(props: {
  readonly source: SOURCE;
  readonly selections: SELECTIONS & {
    readonly [NAME in keyof SELECTIONS]: Readonly<{
      model: SOURCE['models'][keyof SOURCE['models']];
    }>;
  };
  readonly contracts: BINDINGS & {
    readonly [NAME in keyof BINDINGS]: Readonly<{
      contract: BINDINGS[NAME]['target']['contracts'][keyof BINDINGS[NAME]['target']['contracts']];
    }>;
  };
  readonly states: STATES & {
    readonly [NAME in keyof STATES &
      string]: STATES[NAME]['stateName'] extends NAME ? unknown : never;
  };
  readonly onBootstrap: (props: { db: IMachineDb<SOURCE> }) => IValue<STATES>;
  readonly onVersionChange?: (props: {
    origin: IValue<STATES>;
    db: IMachineDb<SOURCE>;
    previousVersion: string;
    version: string;
  }) => IValue<STATES> | undefined;
  readonly routes: ROUTES;
}): MachineDeclaration<typeof props> {
  if (
    !Schema.is(AggregateSchema)(props.source) &&
    !Schema.is(ServiceSchema)(props.source)
  ) {
    throw new TypeError(
      'Machine source must be an authored aggregate or service version',
    );
  }
  decodeStateMap(props.states);
  if (typeof props.onBootstrap !== 'function') {
    throw new TypeError('Machine onBootstrap must be a function');
  }
  if (
    props.onVersionChange !== undefined &&
    typeof props.onVersionChange !== 'function'
  ) {
    throw new TypeError('Machine onVersionChange must be a function');
  }
  for (const [name, selection] of Object.entries(props.selections)) {
    assertSameCoreInstance({
      value: selection.model,
      expected: Model,
      kind: 'Model',
    });
    if (
      !Object.values(props.source.models).includes(selection.model) ||
      selection.query.bindings.some(binding => binding.type === 'identity')
    ) {
      throw new TypeError(
        `Machine selection ${name} must query its source without actor identity`,
      );
    }
  }
  for (const [name, binding] of Object.entries(props.contracts)) {
    assertSameCoreInstance({
      value: binding.contract,
      expected: Contract,
      kind: 'Contract',
    });
    if (!Object.values(binding.target.contracts).includes(binding.contract)) {
      throw new TypeError(
        `Machine contract ${name} must belong to its bound target version`,
      );
    }
  }
  for (const [name, route] of Object.entries(props.routes)) {
    if (
      !Object.hasOwn(props.states, name) ||
      typeof route !== 'object' ||
      route === null
    ) {
      throw new TypeError(
        `Machine route ${name} is not a registered State route`,
      );
    }
    const keys = Reflect.ownKeys(route);
    if (
      keys.some(
        key =>
          typeof key !== 'string' ||
          ![
            'onCommand',
            'wakeAt',
            'onWake',
            'onActivation',
            'command',
            'onResult',
          ].includes(key),
      )
    ) {
      throw new TypeError(`Machine route ${name} has an unsupported field`);
    }
    const work =
      Number('wakeAt' in route) +
      Number('onActivation' in route) +
      Number('command' in route);
    if (
      work > 1 ||
      'wakeAt' in route !== 'onWake' in route ||
      'command' in route !== 'onResult' in route
    ) {
      throw new TypeError(
        `Machine route ${name} must declare one complete automatic work form`,
      );
    }
    for (const value of Object.values(route)) {
      if (typeof value !== 'function') {
        throw new TypeError(
          `Machine route ${name} callbacks must be functions`,
        );
      }
    }
  }
  return new MachineDeclaration(props);
}

export function push<
  const COMMAND extends Readonly<{
    binding: string;
    payload: unknown;
    aggregateId?: string;
  }>,
>(command: COMMAND) {
  return Object.freeze({ ...command, mode: 'push' as const });
}

export function execute<
  const COMMAND extends Readonly<{
    binding: string;
    payload: unknown;
    aggregateId?: string;
  }>,
>(command: COMMAND) {
  return Object.freeze({ ...command, mode: 'execute' as const });
}
