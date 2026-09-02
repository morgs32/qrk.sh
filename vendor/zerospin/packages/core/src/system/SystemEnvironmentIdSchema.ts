import { Schema } from 'effect';

import type { ISystemEnvironmentId } from './types.ts';

export const SystemEnvironmentIdSchema = Schema.Literals([
  'dev',
  'production',
]) satisfies Schema.Codec<ISystemEnvironmentId>;
