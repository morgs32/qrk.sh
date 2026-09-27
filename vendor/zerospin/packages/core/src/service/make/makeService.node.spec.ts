import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAutomation } from '../../automation/makeAutomation.ts';
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
const notice = makeAutomation({
  name: 'notice',
  on: observed,
  contracts: {},
  program: () => Effect.succeed(null),
});

describe('complete service compositions', () => {
  it('keeps versions independent and excludes removed contributions', () => {
    const service = makeService({
      name: 'inventory',
      module: {
        '1.0.0': {
          models: { item },
          contracts: { observed },
          automations: { notice },
        },
        '1.1.0': {
          models: { item: nextItem },
          contracts: { observed: nextObserved },
          automations: {},
        },
      },
    });
    expect(service.versions['1.0.0'].models.item).toBe(item);
    expect(service.versions['1.1.0'].models.item).toBe(nextItem);
    expect(service.versions['1.1.0'].automations).toEqual({});
  });

  it('rejects a stale automation trigger and a contract model outside the host', () => {
    expect(() =>
      makeService({
        name: 'inventory',
        module: {
          '1.1.0': {
            models: { item: nextItem },
            contracts: { observed: nextObserved },
            automations: { notice },
          },
        },
      }),
    ).toThrow('trigger must reference its final contract');
    expect(() =>
      makeService({
        name: 'inventory',
        module: {
          '1.1.0': {
            models: { item: nextItem },
            contracts: { observed },
            automations: {},
          },
        },
      }),
    ).toThrow('must belong to service inventory@1.1.0');
  });
});
