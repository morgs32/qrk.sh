import { Clock, Console, Effect } from 'effect';

export const logNow = Effect.fn('logNow')(function* () {
  const now = yield* Clock.currentTimeMillis; // Fetch the current time from the clock
  yield* Console.log(now);
})();
