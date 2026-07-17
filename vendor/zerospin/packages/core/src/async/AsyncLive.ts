import { Effect, Layer } from 'effect';

import { Async } from './Async.js';

export const AsyncLive = Layer.succeed(Async, {
  tryPromise: props =>
    Effect.tryPromise({ try: props.try, catch: props.catch }),
});
