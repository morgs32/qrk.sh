import { describe, expect, it } from 'vitest';

import { makeTraceId } from './index.ts';

describe('@zerospin/logger', () => {
  it('exports the telemetry surface', () => {
    expect(makeTraceId()).toMatch(/^trc_/);
  });
});
