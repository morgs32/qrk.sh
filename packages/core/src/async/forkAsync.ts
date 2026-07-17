import { Effect } from 'effect';

import type { Async } from './Async.js';
import { AsyncLive } from './AsyncLive.js';

export const forkAsync = <A, E, R>(
  program: Effect.Effect<A, E, Async | R>,
): Effect.Effect<void, never, Exclude<R, Async>> =>
  program.pipe(Effect.provide(AsyncLive), Effect.forkDaemon, Effect.asVoid);
