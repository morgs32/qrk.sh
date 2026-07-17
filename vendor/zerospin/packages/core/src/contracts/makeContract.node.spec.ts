import { describe, expect, it } from 'vitest';

import { makeContract } from './makeContract.ts';

describe('makeContract', () => {
  it('attaches a serializable contract spec with payload JSON Schema', () => {
    const contract = makeContract({
      commandName: 'createItem',
      version: '1.0.0',
      payload: {
        title: { kind: 'text', nullable: false, unique: false },
      },
      mutations: null,
    });

    expect(contract.spec.commandName).toBe('createItem');
    expect(contract.spec.version).toBe('1.0.0');
    expect(contract.spec.payloadJsonSchema).toMatchObject({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    });
    expect(JSON.stringify(contract.spec)).not.toContain('"program"');
  });

  it('rejects a program when mutations is explicitly null', () => {
    expect(() =>
      makeContract({
        commandName: 'readItem',
        version: '1.0.0',
        payload: {
          id: { kind: 'text', nullable: false, unique: false },
        },
        mutations: null,
        // @ts-expect-error runtime validation still protects untyped callers
        program: () => {
          throw new Error('the rejected program must never run');
        },
      }),
    ).toThrow(
      'makeContract: contract "readItem" declares mutations: null and must omit program',
    );
  });
});
