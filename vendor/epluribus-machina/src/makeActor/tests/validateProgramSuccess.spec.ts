import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { RouteContractViolation } from '../../RouteContractViolation.js';
import { makeState } from '../../makeState/makeState.js';
import { validateProgramSuccess } from '../validateProgramSuccess.js';

const Ready = makeState({
  stateName: 'ready',
  input: { value: Schema.String }
})
const origin = { stateName: 'waiting' } as const;

describe('validateProgramSuccess', () => {
  it.each([
    {
      issue: 'MissingStateName' as const,
      result: { value: 'missing-tag' }
    },
    {
      issue: 'UnregisteredState' as const,
      result: { stateName: 'missing', value: 'unregistered' }
    },
    {
      issue: 'SchemaFailure' as const,
      result: { stateName: 'ready', value: 1 }
    }
  ])('rejects $issue with the exact placement path', ({ issue, result }) => {
    expect(() =>
      validateProgramSuccess({
        states: { ready: Ready },
        path: 'waiting.onActivation',
        origin,
        result
      })
    ).toThrowError(
      expect.objectContaining({
        route: 'waiting.onActivation',
        state: 'waiting',
        channel: 'success',
        issue,
        expected: ['ready'],
        origin,
        returned: result
      })
    );
  });

  it('returns the exact registered State and decoded value', () => {
    const result = Ready.make({ value: 'ready' });

    expect(
      validateProgramSuccess({
        states: { ready: Ready },
        path: 'waiting.onActivation',
        origin,
        result
      })
    ).toEqual({ state: Ready, value: result });
  });

  it('uses RouteContractViolation for every invalid success', () => {
    expect(() =>
      validateProgramSuccess({
        states: { ready: Ready },
        path: 'waiting.onActivation',
        origin,
        result: null
      })
    ).toThrow(RouteContractViolation);
  });
});
