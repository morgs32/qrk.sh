import { it } from '@effect/vitest';
import { Cause, Effect, Exit, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { RouteContractViolation } from '../../RouteContractViolation.js';
import { makeState } from '../../makeState/makeState.js';
import { invokeActivationProgram } from '../invokeActivationProgram.js';

const Activated = makeState({
  stateName: 'activated',
  input: {}
})

describe('invokeActivationProgram', () => {
  it.effect('defects when an Activation program uses the failure channel', () =>
    Effect.gen(function* () {
      const origin = { stateName: 'waiting' } as const;
      const returned = 'unexpected-failure';
      // ALLOWED_CAST: the erased runtime Program type carries `unknown`
      // requirements, while this concrete unsafe Program requires nothing.
      const invocation = invokeActivationProgram({
        states: { activated: Activated },
        path: 'waiting.onActivation',
        program: () => Effect.fail(returned),
        origin
      }) as unknown as Effect.Effect<unknown, unknown>;
      const exit = yield* Effect.exit(invocation);

      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) {
        throw new Error('Expected Activation program contract defect');
      }

      const defect = Cause.squash(exit.cause);
      expect(defect).toBeInstanceOf(RouteContractViolation);
      if (!(defect instanceof RouteContractViolation)) {
        throw new Error('Expected RouteContractViolation');
      }
      expect(defect).toMatchObject({
        route: 'waiting.onActivation',
        state: 'waiting',
        channel: 'failure',
        issue: 'SchemaFailure'
      });
      expect(defect.expected).toBe(Schema.Never);
      expect(defect.origin).toBe(origin);
      expect(defect.returned).toBe(returned);
    })
  );
});
