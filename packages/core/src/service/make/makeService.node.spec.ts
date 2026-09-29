import { primitives } from '@zerospin/schema';
import { describe, expect, it } from 'vitest';

import { defineContract } from '../../contracts/defineContract.ts';
import { makeContractVersion } from '../../contracts/make/makeContractVersion.ts';
import { defineModel } from '../../models/defineModel.ts';
import { makeModelVersion } from '../../models/make/makeModelVersion.ts';

import { makeService } from './makeService.ts';

const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { value: primitives.text() },
    indexes: [],
  },
);
const nextItem = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.1.0',
    attributes: { value: primitives.text() },
    indexes: [],
  },
);
const observed = makeContractVersion(defineContract('observed'), {
  version: '1.0.0',
  models: { item },
  payload: { id: primitives.foreignKey({ abbreviation: 'itm' }) },
});
const nextObserved = makeContractVersion(defineContract('observed'), {
  version: '1.1.0',
  models: { item: nextItem },
  payload: { id: primitives.foreignKey({ abbreviation: 'itm' }) },
});
describe('complete service compositions', () => {
  it('keeps versions independent', () => {
    const service = makeService({
      name: 'inventory',
      module: {
        '1.0.0': {
          models: { item },
          contracts: { observed },
        },
        '1.1.0': {
          models: { item: nextItem },
          contracts: { observed: nextObserved },
        },
      },
    });
    expect(service.versions['1.0.0'].models.item).toBe(item);
    expect(service.versions['1.1.0'].models.item).toBe(nextItem);
  });

  it('rejects a contract model outside the host', () => {
    expect(() =>
      makeService({
        name: 'inventory',
        module: {
          '1.1.0': {
            models: { item: nextItem },
            contracts: { observed },
          },
        },
      }),
    ).toThrow('must belong to service inventory@1.1.0');
  });
});
