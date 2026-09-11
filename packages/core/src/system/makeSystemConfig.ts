import { Schema } from 'effect';

import type { ISystemConfig, ISystemId } from './types.ts';
import { ZerospinConfigSchema } from './ZerospinConfigSchema.ts';

export function makeSystemConfig<SYSTEM>(
  system: SYSTEM,
  options: Readonly<{ systemId: ISystemId }>,
): ISystemConfig<SYSTEM> {
  const config = { system, systemId: options.systemId };
  Schema.decodeUnknownSync(ZerospinConfigSchema)(config);
  return config;
}
