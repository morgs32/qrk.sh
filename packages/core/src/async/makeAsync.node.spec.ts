import { ZerospinError } from '@zerospin/error';
import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import { AsyncLive } from './AsyncLive.js';
import { makeAsync } from './makeAsync.js';

describe('makeAsync', () => {
  it('resolves with the promise value', async () => {
    const result = await makeAsync(() => Promise.resolve(42)).pipe(
      Effect.provide(AsyncLive),
      Effect.runPromise,
    );

    expect(result).toBe(42);
  });

  it('maps rejection to async-failed when catch is omitted', async () => {
    const exit = await makeAsync(() => Promise.reject(new Error('boom'))).pipe(
      Effect.provide(AsyncLive),
      Effect.runPromiseExit,
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) {
      return;
    }

    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (!Option.isSome(failure)) {
      return;
    }

    const error = failure.value;
    expect(ZerospinError.isZerospinError(error)).toBe(true);
    if (!ZerospinError.isZerospinError(error)) {
      return;
    }

    expect(error.code).toBe('async-failed');
    expect(error.message).toContain('boom');
    expect(error.cause).not.toBeNull();
  });

  it('uses a custom catch callback', async () => {
    const exit = await makeAsync(
      () => Promise.reject(new Error('ignored')),
      () =>
        new ZerospinError({
          code: 'clerk-organization-not-found',
          message: 'Organization not found',
        }),
    ).pipe(Effect.provide(AsyncLive), Effect.runPromiseExit);

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) {
      return;
    }

    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (!Option.isSome(failure)) {
      return;
    }

    const error = failure.value;
    expect(ZerospinError.isZerospinError(error)).toBe(true);
    if (!ZerospinError.isZerospinError(error)) {
      return;
    }

    expect(error.code).toBe('clerk-organization-not-found');
    expect(error.rawMessage).toBe('Organization not found');
  });

  it('accepts ZerospinError.catch as the catch callback', async () => {
    const exit = await makeAsync(
      () => Promise.reject(new Error('worker failed')),
      ZerospinError.catch({
        code: 'failed-to-apply-session-batch-update-to-shared-worker',
        message: 'Failed to apply session batch update to SharedWorker',
        preferCauseMessage: false,
      }),
    ).pipe(Effect.provide(AsyncLive), Effect.runPromiseExit);

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) {
      return;
    }

    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (!Option.isSome(failure)) {
      return;
    }

    const error = failure.value;
    expect(ZerospinError.isZerospinError(error)).toBe(true);
    if (!ZerospinError.isZerospinError(error)) {
      return;
    }

    expect(error.code).toBe(
      'failed-to-apply-session-batch-update-to-shared-worker',
    );
    expect(error.rawMessage).toBe(
      'Failed to apply session batch update to SharedWorker',
    );
    expect(error.cause).not.toBeNull();
  });

  it('fails when Async is not provided', async () => {
    const exit = await makeAsync(() => Promise.resolve(42)).pipe(
      Effect.runPromiseExit,
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
