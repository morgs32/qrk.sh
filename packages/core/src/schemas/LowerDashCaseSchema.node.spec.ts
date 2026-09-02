import { Result, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { LowerDashCaseSchema } from './LowerDashCaseSchema.ts';

const decode = Schema.decodeUnknownResult(LowerDashCaseSchema);

describe('LowerDashCaseSchema', () => {
  it.each(['production', 'my-service', 'prod-2', 'v2'])('accepts %s', value => {
    expect(Result.isSuccess(decode(value))).toBe(true);
  });

  it.each(['Prod', 'my_service', 'prod 2', '', ' foo'])('rejects %s', value => {
    expect(Result.isFailure(decode(value))).toBe(true);
  });
});
