import { Context } from 'effect';

import type { ICuidFactory } from '../utils/types.ts';

export class CuidFactory extends Context.Tag('CuidFactory')<
  CuidFactory,
  ICuidFactory
>() {}
