import { Schema } from 'effect';

import type { ISystemEnvironmentId } from './types.ts';

export const SystemEnvironmentIdSchema = Schema.Literal(
  'dev',
  'production',
) satisfies Schema.Schema<ISystemEnvironmentId>;
