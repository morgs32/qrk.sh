import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { contracts } from '../contracts/index.ts';
import { models } from '../models/index.ts';

import {
  AggregateFrontendLockSchema,
  makeAggregateFrontendLock,
} from './makeAggregateFrontendLock.ts';
import { makeAggregateFrontendLockKey } from './makeAggregateFrontendLockKey.ts';
import { makeFrontendController } from './makeFrontendController.ts';

const Item = models.makeVersion(
  models.makeModel({ name: 'item', abbreviation: 'itm' }),
  {
    attributes: { title: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
);

const List = models.makeVersion(
  models.makeModel({ name: 'list', abbreviation: 'lst' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const renameItem = contracts.makeVersion(contracts.makeCommand('renameItem'), {
  version: '2.0.0',
  payload: { title: primitives.text() },
});

const createList = contracts.makeVersion(contracts.makeCommand('createList'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

describe('aggregate frontend lock', () => {
  it.effect(
    'encodes the complete exact selection and hashes it canonically',
    () =>
      Effect.gen(function* () {
        const left = makeFrontendController({
          aggregateVersion: '1.0.0',
          systemName: 'shopping',
          aggregateName: 'shopper',
          name: 'web',
          models: { item: Item, list: List },
          contracts: {
            createList: { contract: createList },
            renameItem: { contract: renameItem },
          },
        });
        const right = makeFrontendController({
          aggregateVersion: '1.0.0',
          systemName: 'shopping',
          aggregateName: 'customer',
          name: 'web',
          models: { list: List, item: Item },
          contracts: {
            renameItem: { contract: renameItem },
            createList: { contract: createList },
          },
        });

        const leftLock = makeAggregateFrontendLock({ frontend: left });
        const rightLock = makeAggregateFrontendLock({
          frontend: right,
        });
        const leftKey = yield* makeAggregateFrontendLockKey(leftLock);
        const rightKey = yield* makeAggregateFrontendLockKey(rightLock);

        expect(Schema.is(AggregateFrontendLockSchema)(leftLock)).toBe(true);
        expect(leftLock).toEqual(rightLock);
        expect(leftLock).not.toHaveProperty('kind');
        expect(leftLock).not.toHaveProperty('ownerName');
        expect(leftLock).not.toHaveProperty('userIdJsonSchema');
        expect(leftLock).not.toHaveProperty('signature');
        expect(leftLock.models.item?.propertiesShape).toMatchObject({
          id: { kind: 'primaryKey', nullable: false },
        });
        expect(leftLock.contracts.renameItem?.payloadShape).toMatchObject({
          title: { kind: 'text', nullable: false },
        });
        expect(leftKey).toBe(rightKey);
        expect(leftKey).toBe(
          'faf30649ae37f6d601e9d00fd12e69783299ab4345d777140ee3632eb3666cbd',
        );
        expect(leftLock).not.toHaveProperty('version');
      }),
  );

  it.effect('changes the key when an exact selected definition changes', () =>
    Effect.gen(function* () {
      const baseline = makeFrontendController({
        aggregateVersion: '1.0.0',
        systemName: 'shopping',
        aggregateName: 'shopper',
        name: 'web',
        models: { item: Item },
        contracts: { renameItem: { contract: renameItem } },
      });
      const ChangedItem = models.makeVersion(
        models.makeModel({ name: 'item', abbreviation: 'itm' }),
        {
          attributes: { title: primitives.integer() },
          indexes: [],
          version: '2.0.0',
        },
      );
      const changed = makeFrontendController({
        aggregateVersion: '1.0.0',
        systemName: 'shopping',
        aggregateName: 'shopper',
        name: 'web',
        models: { item: ChangedItem },
        contracts: { renameItem: { contract: renameItem } },
      });

      const baselineKey = yield* makeAggregateFrontendLockKey(
        makeAggregateFrontendLock({ frontend: baseline }),
      );
      const changedKey = yield* makeAggregateFrontendLockKey(
        makeAggregateFrontendLock({ frontend: changed }),
      );

      expect(changedKey).not.toBe(baselineKey);
    }),
  );
});
