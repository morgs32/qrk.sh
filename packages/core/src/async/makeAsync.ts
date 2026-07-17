import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { Async } from './Async.js';

const defaultCatchFn = ZerospinError.catch({ code: 'async-failed' });

export function makeAsync<SUCCESS>(
  tryFn: () => PromiseLike<SUCCESS>,
): Effect.Effect<SUCCESS, ZerospinError<'async-failed'>, Async>;

export function makeAsync<SUCCESS, ERROR extends IAnyError>(
  tryFn: () => PromiseLike<SUCCESS>,
  catchFn: (cause: unknown) => ERROR,
): Effect.Effect<SUCCESS, ERROR, Async>;

export function makeAsync<SUCCESS, ERROR extends IAnyError>(
  tryFn: () => PromiseLike<SUCCESS>,
  catchFn?: (cause: unknown) => ERROR,
): Effect.Effect<SUCCESS, IAnyError, Async> {
  return Effect.gen(function* () {
    const async = yield* Async;
    return yield* async.tryPromise<SUCCESS, IAnyError>({
      try: tryFn,
      catch: catchFn ?? defaultCatchFn,
    });
  });
}
