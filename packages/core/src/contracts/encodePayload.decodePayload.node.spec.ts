import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { primitives } from '../models/primitives.ts';

import { makeContract } from './makeContract.ts';

describe('contract payload methods', () => {
  const contract = makeContract({
    commandName: 'doThing',
    payload: {
      name: primitives.text(),
      count: primitives.integer(),
    },
    mutations: null,
    version: '1.0.0',
  });

  it('encodes a valid decoded payload to a JSON string', async () => {
    const payload = await Effect.runPromise(
      contract.encodePayload({
        payload: { name: 'ok', count: 123 },
      }),
    );

    expect(payload).toBe(JSON.stringify({ name: 'ok', count: 123 }));
  });

  it('validates a decoded JSON field without requiring a pre-encoded string', async () => {
    const jsonContract = makeContract({
      commandName: 'useJson',
      payload: {
        data: primitives.json({
          schema: Schema.Struct({ value: Schema.String }),
        }),
      },
      mutations: null,
      version: '1.0.0',
    });

    const payload = await Effect.runPromise(
      jsonContract.validatePayload({
        payload: { data: { value: 'decoded input' } },
      }),
    );

    expect(payload).toEqual({ data: { value: 'decoded input' } });
  });

  it('rejects missing payload fields while encoding', async () => {
    await expect(
      Effect.runPromise(
        contract.encodePayload({
          payload: { name: 'ok' } as { name: string; count: number },
        }),
      ),
    ).rejects.toThrow();
  });

  it('decodes a valid JSON payload string', async () => {
    const payload = await Effect.runPromise(
      contract.decodePayload({
        command: {
          id: 'cmd_1',
          commandName: 'doThing',
          payload: JSON.stringify({ name: 'ok', count: 123 }),
        },
      }),
    );

    expect(payload).toEqual({ name: 'ok', count: 123 });
  });

  it('rejects malformed JSON while decoding', async () => {
    await expect(
      Effect.runPromise(
        contract.decodePayload({
          command: {
            id: 'cmd_1',
            commandName: 'doThing',
            payload: '{',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('rejects schema-invalid JSON while decoding', async () => {
    await expect(
      Effect.runPromise(
        contract.decodePayload({
          command: {
            id: 'cmd_1',
            commandName: 'doThing',
            payload: JSON.stringify({ name: 'ok' }),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
