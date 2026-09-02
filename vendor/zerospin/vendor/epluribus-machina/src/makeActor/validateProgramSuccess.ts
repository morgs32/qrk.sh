import { Schema } from 'effect';

import { RouteContractViolation } from '../RouteContractViolation.js';
import type { IStateMap } from '../types.js';

type IStateValue = { readonly stateName: string };

/** Validate one program success before the Actor commits it. */
export const validateProgramSuccess = (props: {
  readonly states: IStateMap;
  readonly path: string;
  readonly origin: IStateValue;
  readonly result: unknown;
}): {
  readonly state: IStateMap[string];
  readonly value: IStateValue;
} => {
  const { origin, path, result, states } = props;
  const expected = Object.keys(states).sort();
  const returnedStateName =
    typeof result === 'object' && result !== null
      ? Reflect.get(result, 'stateName')
      : undefined;

  if (typeof returnedStateName !== 'string') {
    throw new RouteContractViolation({
      route: path,
      state: origin.stateName,
      origin,
      channel: 'success',
      expected,
      issue: 'MissingStateName',
      returned: result
    });
  }

  const state = Object.hasOwn(states, returnedStateName)
    ? states[returnedStateName]
    : undefined;
  if (state === undefined) {
    throw new RouteContractViolation({
      route: path,
      state: origin.stateName,
      origin,
      channel: 'success',
      expected,
      issue: 'UnregisteredState',
      returned: result
    });
  }

  if (!Schema.is(state.schema)(result)) {
    throw new RouteContractViolation({
      route: path,
      state: origin.stateName,
      origin,
      channel: 'success',
      expected,
      issue: 'SchemaFailure',
      returned: result
    });
  }

  return {
    state,
    // ALLOWED_CAST: the registered State Schema validation above proves the
    // returned value is a named runtime State value.
    value: result as IStateValue
  };
};
