import { Effect, Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { mapParseError } from './mapParseError.js';
import { ZerospinError } from './ZerospinError.js';

const PersonSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
});

describe('mapParseError', () => {
  it('maps SchemaError to ZerospinError with prefix and formatted issue', async () => {
    const maybePerson = await Schema.decodeUnknownEffect(PersonSchema)({}).pipe(
      mapParseError({
        code: 'failed-to-decode-person',
        prefix: 'Failed to decode person',
      }),
      Effect.result,
      Effect.runPromise,
    );

    expect(Result.isFailure(maybePerson)).toBe(true);
    if (!Result.isFailure(maybePerson)) {
      return;
    }

    expect(maybePerson.failure).toBeInstanceOf(ZerospinError);
    expect(maybePerson.failure.code).toBe('failed-to-decode-person');
    expect(maybePerson.failure.message).toContain('Failed to decode person:');
    expect(maybePerson.failure.message).not.toContain('<declaration schema>');
    expect(maybePerson.failure.cause).toBeNull();
    expect(maybePerson.failure.extra).toBeNull();
  });

  it('forwards extra when provided', async () => {
    const maybePerson = await Schema.decodeUnknownEffect(PersonSchema)({}).pipe(
      mapParseError({
        code: 'failed-to-decode-person',
        prefix: 'Failed to decode person',
        extra: { requestId: 'req_1' },
      }),
      Effect.result,
      Effect.runPromise,
    );

    expect(Result.isFailure(maybePerson)).toBe(true);
    if (!Result.isFailure(maybePerson)) {
      return;
    }

    expect(maybePerson.failure).toBeInstanceOf(ZerospinError);
    expect(maybePerson.failure.extra).toEqual({ requestId: 'req_1' });
  });
});
