import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../../authentication/makeSignature.ts';
import { makeSystem } from '../makeSystem.ts';

describe('makeSystem', () => {
  it('rejects an empty system version', () => {
    expect(() =>
      makeSystem({
        name: 'test',
        version: '',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSystem({
        name: 'test',
        version: '',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
      }),
    ).toThrow(/Expected a value with a length of at least 1/);
  });
});
