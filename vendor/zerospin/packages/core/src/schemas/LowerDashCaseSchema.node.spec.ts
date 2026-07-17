import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { LowerDashCaseSchema } from './LowerDashCaseSchema.ts';

const decode = Schema.decodeUnknownEither(LowerDashCaseSchema);

describe('LowerDashCaseSchema', () => {
  it.each(['production', 'my-service', 'prod-2', 'v2'])('accepts %s', value => {
    expect(Either.isRight(decode(value))).toBe(true);
  });

  it.each(['Prod', 'my_service', 'prod 2', '', ' foo'])('rejects %s', value => {
    expect(Either.isLeft(decode(value))).toBe(true);
  });
});
