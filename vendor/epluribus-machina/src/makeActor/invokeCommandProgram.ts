import { Effect, Schema } from 'effect';

import type { IStateMap } from '../types.js';
import { validateProgramSuccess } from './validateProgramSuccess.js';

type IStateValue = { readonly stateName: string };

/** Invoke one Command program and enforce its payload and result contracts. */
export const invokeCommandProgram = Effect.fn('invokeCommandProgram')(
  function* <SUCCESS, FAILURE, SERVICES>(props: {
    readonly states: IStateMap;
    readonly path: string;
    readonly command: {
      readonly payload: Schema.Top;
      readonly program: (request: {
        readonly origin: IStateValue;
        readonly payload: unknown;
      }) => Effect.Effect<SUCCESS, FAILURE, SERVICES>;
    };
    readonly origin: IStateValue;
    readonly payload: unknown;
  }) {
    const { command, origin, path, payload, states } = props;

    if (!Schema.is(command.payload)(payload)) {
      return yield* Effect.die(
        new TypeError(
          `MachineActor payload does not satisfy Command Route "${path}"`
        )
      );
    }

    const result = yield* Effect.suspend(() =>
      command.program({ origin, payload })
    );

    return validateProgramSuccess({ states, path, origin, result });
  }
);
