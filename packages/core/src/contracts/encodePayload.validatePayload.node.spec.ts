import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

import { defineCommand } from './Command.ts';
import { encodePayload } from './encodePayload.ts';
import { makeContractVersion } from './makeVersion.ts';
import { validatePayload } from './validatePayload.ts';

describe('contract payload utilities', () => {
  const contract = makeContractVersion(defineCommand('doThing'), {
    payload: {
      name: primitives.text(),
      count: primitives.integer(),
    },
    version: '1.0.0',
  });

  it('encodes a valid decoded payload to a JSON string', async () => {
    const payload = await Effect.runPromise(
      encodePayload(contract, {
        version: contract.version,
        payload: { name: 'ok', count: 123 },
      }),
    );

    expect(payload).toBe(JSON.stringify({ name: 'ok', count: 123 }));
  });

  it('validates a decoded JSON field without requiring a pre-encoded string', async () => {
    const jsonContract = makeContractVersion(defineCommand('useJson'), {
      payload: {
        data: primitives.json({
          schema: Schema.Struct({ value: Schema.String }),
        }),
      },
      version: '1.0.0',
    });

    const payload = await Effect.runPromise(
      validatePayload(jsonContract, {
        version: jsonContract.version,
        payload: { data: { value: 'decoded input' } },
      }).pipe(
        Effect.provide(makePrefixedIncrementalIdFactory('validatePayload')),
      ),
    );

    expect(payload).toEqual({ data: { value: 'decoded input' } });
  });

  it('rejects missing payload fields while encoding', async () => {
    await expect(
      Effect.runPromise(
        encodePayload(contract, {
          version: contract.version,
          payload: { name: 'ok' } as { name: string; count: number },
        }),
      ),
    ).rejects.toThrow();
  });
});
