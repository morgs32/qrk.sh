import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  advanceSelectionHash,
  GENESIS_SELECTION_PREIMAGE,
  genesisSelectionHash,
} from './selectionDispositionHash.ts';

describe('selectionDispositionHash', () => {
  it('hashes the frozen genesis preimage', () => {
    expect(GENESIS_SELECTION_PREIMAGE).toBe(
      'zerospin.selection.disposition.v1',
    );
    expect(genesisSelectionHash()).toBe(
      createHash('sha256')
        .update(GENESIS_SELECTION_PREIMAGE)
        .digest('hex'),
    );
  });

  it('rolls SHA-256 over the canonical JSON tuple', () => {
    const first = advanceSelectionHash({
      previousSelectionHash: genesisSelectionHash(),
      selectionIndex: 1,
      commandId: 'cmd_test',
      disposition: 'success',
    });
    expect(first).toBe(
      createHash('sha256')
        .update(
          JSON.stringify([
            genesisSelectionHash(),
            1,
            'cmd_test',
            'success',
          ]),
        )
        .digest('hex'),
    );
  });

  it('changes the hash when an earlier command differs with the same final command', () => {
    const sharedFinal = {
      selectionIndex: 2,
      commandId: 'cmd_final',
      disposition: 'success' as const,
    };
    const pathA = advanceSelectionHash({
      previousSelectionHash: advanceSelectionHash({
        previousSelectionHash: genesisSelectionHash(),
        selectionIndex: 1,
        commandId: 'cmd_a',
        disposition: 'success',
      }),
      ...sharedFinal,
    });
    const pathB = advanceSelectionHash({
      previousSelectionHash: advanceSelectionHash({
        previousSelectionHash: genesisSelectionHash(),
        selectionIndex: 1,
        commandId: 'cmd_b',
        disposition: 'success',
      }),
      ...sharedFinal,
    });
    expect(pathA).not.toBe(pathB);
  });

  it('changes the hash when disposition changes', () => {
    const success = advanceSelectionHash({
      previousSelectionHash: genesisSelectionHash(),
      selectionIndex: 1,
      commandId: 'cmd_test',
      disposition: 'success',
    });
    const failure = advanceSelectionHash({
      previousSelectionHash: genesisSelectionHash(),
      selectionIndex: 1,
      commandId: 'cmd_test',
      disposition: 'failure',
    });
    expect(success).not.toBe(failure);
  });
});
