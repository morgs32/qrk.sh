import { Data } from 'effect';

export class StateInactive extends Data.TaggedError('StateInactive')<{
  readonly state: string;
  readonly current: string;
}> {}
