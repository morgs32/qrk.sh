import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/make/makeContractVersion.ts';

import { makeAutomation } from './makeAutomation.ts';

const observed = makeContractVersion(defineContract('observed'), {
  version: '1.0.0',
  models: {},
  payload: { value: primitives.integer() },
});
const record = makeContractVersion(defineContract('record'), {
  version: '1.0.0',
  models: {},
  payload: { value: primitives.integer() },
});

describe('makeAutomation', () => {
  it('preserves observed and output contracts without adding browser permissions', () => {
    const automation = makeAutomation({
      name: 'recordObservation',
      on: observed,
      contracts: { record },
      program: Effect.fn(function* ({ db, on, contracts }) {
        yield* Effect.void;
        const value: number = on.payload.value;
        if ('serviceName' in on) {
          const serviceVersion: string = on.serviceVersion;
          void serviceVersion;
        } else {
          const aggregateId: string = on.aggregateId;
          void aggregateId;
        }
        if (value < 0) {
          // @ts-expect-error Automation db exposes queries, not direct writes.
          db.update({});
          // @ts-expect-error Observed payload remains contract-typed.
          const wrong: string = on.payload.value;
          // @ts-expect-error Outputs must belong to the declared registry.
          contracts.missing({ value });
          // @ts-expect-error Output payload must satisfy its contract.
          contracts.record({ value: 'wrong' });
          void wrong;
        }
        return contracts.record({ value });
      }),
    });
    expect(automation.on).toBe(observed);
    expect(automation.contracts.record).toBe(record);
    expect(Object.isFrozen(automation)).toBe(true);
  });

  it('allows null but rejects command arrays in the authored interface', () => {
    const automation = makeAutomation({
      name: 'ignore',
      on: observed,
      contracts: {},
      program: () => Effect.succeed(null),
    });
    expect(automation.name).toBe('ignore');
    if (automation.name.length === 0) {
      const many = () =>
        Effect.succeed([{ contract: record, payload: { value: 1 } }]);
      makeAutomation({
        name: 'many',
        on: observed,
        contracts: { record },
        // @ts-expect-error A reaction returns one command or null, never an array.
        program: many,
      });
    }
  });

  it('rejects misnamed output contracts at construction', () => {
    expect(() =>
      makeAutomation({
        name: 'bad',
        on: observed,
        contracts: { wrong: record },
        program: () => Effect.succeed(null),
      }),
    ).toThrow('Invalid automation output contract wrong');
  });
});
