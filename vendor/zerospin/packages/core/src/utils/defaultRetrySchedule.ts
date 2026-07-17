import { Schedule } from 'effect';

/** Three total attempts with exponential delays beginning at 250 milliseconds. */
export const defaultRetrySchedule = Schedule.recurs(2).pipe(
  Schedule.intersect(Schedule.exponential(250, 2)),
);
