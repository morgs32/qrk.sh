import {
  catchZerospinError,
  type IAnyError,
  type IZerospinError,
} from '@zerospin/error';
import { Effect } from 'effect';

import { Async } from '../Async.js';

const defaultCatchFn = catchZerospinError({ code: 'async-failed' });

export function makeAsync<SUCCESS>(
  tryFn: () => PromiseLike<SUCCESS>,
): Effect.Effect<SUCCESS, IZerospinError<'async-failed'>, Async>;

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
