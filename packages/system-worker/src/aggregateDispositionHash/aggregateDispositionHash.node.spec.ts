import { describe, expect, it } from 'vitest';

import {
  advanceDispositionHash,
  GENESIS_DISPOSITION_PREIMAGE,
  genesisDispositionHash,
} from './aggregateDispositionHash.ts';

describe('aggregateDispositionHash', () => {
  it('hashes the frozen genesis preimage', () => {
    expect(GENESIS_DISPOSITION_PREIMAGE).toBe(
      'zerospin.aggregate.disposition.v1',
    );
    expect(genesisDispositionHash()).toBe(
      'ac5d5ad64482e54218ed9a201af48d0a5fd25db2f10428044b73ee1cf6f60b12',
    );
  });

  it('rolls SHA-256 over the canonical JSON tuple', () => {
    expect(
      advanceDispositionHash({
        previousDispositionHash: genesisDispositionHash(),
        aggregateIndex: 1,
        commandId: 'cmd_test',
        disposition: 'success',
      }),
    ).toBe('0086786d0d0f3ba4eb4483fe3eddaff4b2c75eac77f8f8d4137b3c099819db83');
  });

  it('changes the hash when disposition changes', () => {
    const success = advanceDispositionHash({
      previousDispositionHash: genesisDispositionHash(),
      aggregateIndex: 1,
      commandId: 'cmd_test',
      disposition: 'success',
    });
    const failure = advanceDispositionHash({
      previousDispositionHash: genesisDispositionHash(),
      aggregateIndex: 1,
      commandId: 'cmd_test',
      disposition: 'failure',
    });
    expect(success).not.toBe(failure);
  });
});
