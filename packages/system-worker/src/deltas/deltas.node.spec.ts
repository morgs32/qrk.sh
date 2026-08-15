/*
 * System-worker annotation:
 * Exercises the deltas.node.spec behavior through the local test/runtime harness.
 * The assertions document expected integration behavior; avoid broad rewrites while changing production code.
 */

import { describe, expect } from 'vitest';

import { getInsertedResources } from './getInsertedResources.js';

describe('getInsertedResources', () => {
  it('keeps destination selected resources that were absent from origin refs', () => {
    const usrExisting = { id: 'usr_existing', modelName: 'user' };
    const usrAdded = { id: 'usr_added', modelName: 'user', name: 'Added' };
    const usrRemoved = { id: 'usr_removed', modelName: 'user' };

    const inserted = getInsertedResources({
      originSelectedRefs: {
        usr_existing: usrExisting,
        usr_removed: usrRemoved,
      },
      destinationSelectedResources: {
        usr_existing: { ...usrExisting, name: 'Existing' },
        usr_added: usrAdded,
      },
    });

    expect(inserted).toEqual({
      usr_added: usrAdded,
    });
  });
});
