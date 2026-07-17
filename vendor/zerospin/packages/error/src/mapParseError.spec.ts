import { Effect, Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { mapParseError } from './mapParseError.js';
import { ZerospinError } from './ZerospinError.js';

const PersonSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
});

describe('mapParseError', () => {
  it('maps ParseError to ZerospinError with prefix and TreeFormatter message', async () => {
    const maybePerson = await Schema.decodeUnknown(PersonSchema)({}).pipe(
      mapParseError({
        code: 'failed-to-decode-person',
        prefix: 'Failed to decode person',
      }),
      Effect.either,
      Effect.runPromise,
    );

    expect(Either.isLeft(maybePerson)).toBe(true);
    if (!Either.isLeft(maybePerson)) {
      return;
    }

    expect(maybePerson.left).toBeInstanceOf(ZerospinError);
    expect(maybePerson.left.code).toBe('failed-to-decode-person');
    expect(maybePerson.left.message).toContain('Failed to decode person:');
    expect(maybePerson.left.message).not.toContain('<declaration schema>');
    expect(maybePerson.left.cause).toBeNull();
    expect(maybePerson.left.extra).toBeNull();
  });

  it('forwards extra when provided', async () => {
    const maybePerson = await Schema.decodeUnknown(PersonSchema)({}).pipe(
      mapParseError({
        code: 'failed-to-decode-person',
        prefix: 'Failed to decode person',
        extra: { requestId: 'req_1' },
      }),
      Effect.either,
      Effect.runPromise,
    );

    expect(Either.isLeft(maybePerson)).toBe(true);
    if (!Either.isLeft(maybePerson)) {
      return;
    }

    expect(maybePerson.left).toBeInstanceOf(ZerospinError);
    expect(maybePerson.left.extra).toEqual({ requestId: 'req_1' });
  });
});
