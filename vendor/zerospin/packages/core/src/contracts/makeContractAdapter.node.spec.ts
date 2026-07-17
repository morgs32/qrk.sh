import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeContract } from './makeContract.ts';
import {
  identityContractAdapt,
  makeContractAdapter,
} from './makeContractAdapter.ts';

const contract = makeContract({
  commandName: 'createItem',
  version: '1.0.0',
  payload: {},
  mutations: null,
});

describe('makeContractAdapter', () => {
  it('returns its props verbatim', () => {
    const props = {
      contract,
      adapt: ({ payload }: { payload: object }) => Effect.succeed(payload),
    };

    expect(makeContractAdapter(props)).toBe(props);
  });

  it('keeps payloads unchanged through the identity adapter', () => {
    const payload = { id: 'item_1' };

    expect(Effect.runSync(identityContractAdapt({ contract, payload }))).toBe(
      payload,
    );
  });
});
