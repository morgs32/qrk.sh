import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { encodeError } from './encodeError.js';
import {
  matchZerospinErrorCode,
  recognizeZerospinError,
} from './matchZerospinErrorCode.js';
import { ContractError } from './ScopedError.js';

it('preserves the exact public failure through recognized and unfamiliar contracts', async () => {
  const expired = ContractError.schema({
    code: 'expired',
    extra: Schema.Struct({ at: Schema.DateFromString }),
  });
  const wire = {
    _tag: 'ZerospinError',
    scope: 'contract',
    code: 'expired',
    message: 'Expired',
    status: 409,
    extra: { at: '2026-09-25T12:00:00.000Z' },
  };
  const recognized = recognizeZerospinError(expired, wire);
  expect(
    matchZerospinErrorCode({
      failure: recognized,
      onMatch: { expired: error => error.extra.at },
      onUnknown: () => null,
    }),
  ).toEqual(new Date(wire.extra.at));
  expect(await Effect.runPromise(encodeError(recognized))).toEqual(wire);
  const unfamiliar = {
    ...wire,
    code: 'future-code',
    extra: ['json', { untouched: true }],
  };
  const unknown = recognizeZerospinError(expired, unfamiliar);
  expect(
    matchZerospinErrorCode({
      failure: unknown,
      onMatch: { expired: () => 'known' },
      onUnknown: error => error.code,
    }),
  ).toBe('future-code');
  expect(await Effect.runPromise(encodeError(unknown))).toEqual(unfamiliar);
});

it('rejects invalid failure envelopes while accepting unfamiliar JSON extras', () => {
  expect(() =>
    recognizeZerospinError(Schema.Never, {
      _tag: 'ZerospinError',
      code: 'bad',
      message: 'Invalid',
    }),
  ).toThrow();
  expect(() =>
    recognizeZerospinError(Schema.Never, {
      _tag: 'ZerospinError',
      code: 'ok',
      message: 'Valid',
      status: null,
      extra: { nested: [1, null, true] },
    }),
  ).not.toThrow();
});
