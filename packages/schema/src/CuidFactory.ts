import { Context } from 'effect';

import type { ICuidFactory } from './types.ts';

export class CuidFactory extends Context.Service<CuidFactory, ICuidFactory>()(
  'CuidFactory',
) {}
