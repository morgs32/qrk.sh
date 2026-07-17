import type { IProfiler } from './makeProfilerLayer.ts';

export function isProfiler(received: unknown): received is IProfiler {
  return (
    Boolean(received) &&
    typeof received === 'object' &&
    received !== null &&
    'getProcedure' in received &&
    typeof received.getProcedure === 'function'
  );
}
