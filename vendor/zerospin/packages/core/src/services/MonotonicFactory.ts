import { Context } from 'effect';

import type { IMonotonicFactory } from '../utils/types.ts';

export class MonotonicFactory extends Context.Service<
  MonotonicFactory,
  IMonotonicFactory
>()('MonotonicFactory') {}
