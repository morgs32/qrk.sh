import { Effect, Schema } from 'effect';

import { RouteContractViolation } from '../RouteContractViolation.js';
import type { IStateMap } from '../types.js';
import { validateProgramSuccess } from './validateProgramSuccess.js';

type IStateValue = { readonly stateName: string };

/** Invoke one Activation program and enforce its no-failure Route contract. */
export const invokeActivationProgram = Effect.fn(
  'invokeActivationProgram'
)(function* <SUCCESS, FAILURE, SERVICES>(props: {
  readonly states: IStateMap;
  readonly path: string;
  readonly program: (request: {
    readonly origin: IStateValue;
  }) => Effect.Effect<SUCCESS, FAILURE, SERVICES>;
  readonly origin: IStateValue;
}) {
  const { origin, path, program, states } = props;

  const result = yield* Effect.suspend(() => program({ origin })).pipe(
    Effect.catch((failure) =>
      Effect.die(
        new RouteContractViolation({
          route: path,
          state: origin.stateName,
          origin,
          channel: 'failure',
          expected: Schema.Never,
          issue: 'SchemaFailure',
          returned: failure
        })
      )
    )
  );

  return validateProgramSuccess({ states, path, origin, result });
});
