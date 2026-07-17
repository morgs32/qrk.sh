import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  isTransientDoError,
  retryTransientDoErrors,
} from './retryTransientDoErrors';

describe('isTransientDoError', () => {
  it('matches DO reset and namespace-deleted messages and causes', () => {
    expect(
      isTransientDoError(
        new ZerospinError({
          code: 'x',
          message: 'Durable Object reset because its code was updated',
        }),
      ),
    ).toBe(true);
    expect(
      isTransientDoError(
        new ZerospinError({
          code: 'x',
          message: 'wrapped',
          cause: 'Durable Object Namespace was deleted',
        }),
      ),
    ).toBe(true);
    expect(
      isTransientDoError(new ZerospinError({ code: 'x', message: 'boom' })),
    ).toBe(false);
  });
});

describe('retryTransientDoErrors', () => {
  it('does not retry non-transient failures', async () => {
    let attempts = 0;
    const failing = Effect.gen(function* () {
      attempts += 1;
      return yield* new ZerospinError({ code: 'x', message: 'boom' });
    });
    await expect(
      Effect.runPromise(failing.pipe(retryTransientDoErrors)),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});
