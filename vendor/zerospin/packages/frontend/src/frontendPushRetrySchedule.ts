import { Duration, Effect, Schedule } from 'effect';

export const frontendPushRetrySchedule = Schedule.exponential(250, 2).pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.seconds(30))),
  ),
);
