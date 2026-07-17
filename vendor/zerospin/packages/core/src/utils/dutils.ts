import { DateTime, Effect } from 'effect';

export const dutils = {
  date: Effect.fn('dutils.date')(function* () {
    const date = yield* DateTime.now;
    return DateTime.toDateUtc(date);
  }),
  hash: Effect.fn('dutils.hash')(function* () {
    const date = yield* DateTime.now;
    return date.epochMillis.toString(36);
  }),
};
