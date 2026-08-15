import { it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import {
  AggregateFrontendLockSchema,
  makeAggregateFrontendLock,
} from './makeAggregateFrontendLock.ts';
import { makeAggregateFrontendLockKey } from './makeAggregateFrontendLockKey.ts';
import { makeFrontendController } from './makeFrontendController.ts';

const Item = makeModel(
  {
    abbreviation: 'itm',
    modelName: 'item',
    attributes: { title: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
  [],
);

const List = makeModel(
  {
    abbreviation: 'lst',
    modelName: 'list',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const renameItem = makeContract({
  commandName: 'renameItem',
  version: '2.0.0',
  payload: { title: primitives.text() },
  mutations: null,
});

const createList = makeContract({
  commandName: 'createList',
  version: '1.0.0',
  payload: { name: primitives.text() },
  mutations: null,
});

describe('aggregate frontend lock', () => {
  it.effect(
    'encodes the complete exact selection and hashes it canonically',
    () =>
      Effect.gen(function* () {
        const left = makeFrontendController({
          systemName: 'shopping',
          aggregateName: 'shopper',
          frontendName: 'web',
          models: { item: Item, list: List },
          contracts: { createList, renameItem },
        });
        const right = makeFrontendController({
          systemName: 'shopping',
          aggregateName: 'customer',
          frontendName: 'web',
          models: { list: List, item: Item },
          contracts: { renameItem, createList },
        });

        const leftLock = yield* makeAggregateFrontendLock({ frontend: left });
        const rightLock = yield* makeAggregateFrontendLock({
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
        expect(leftKey).toBe(rightKey);
        expect(leftKey).toMatch(/^[0-9a-f]{64}$/u);
        expect(leftLock).not.toHaveProperty('version');
      }),
  );

  it.effect('changes the key when an exact selected definition changes', () =>
    Effect.gen(function* () {
      const baseline = makeFrontendController({
        systemName: 'shopping',
        aggregateName: 'shopper',
        frontendName: 'web',
        models: { item: Item },
        contracts: { renameItem },
      });
      const changed = makeFrontendController({
        systemName: 'shopping',
        aggregateName: 'shopper',
        frontendName: 'web',
        models: {
          item: makeModel(
            {
              abbreviation: 'itm',
              modelName: 'item',
              attributes: { title: primitives.integer() },
              indexes: [],
              version: '2.0.0',
            },
            [],
          ),
        },
        contracts: { renameItem },
      });

      const baselineKey = yield* makeAggregateFrontendLock({
        frontend: baseline,
      }).pipe(Effect.flatMap(makeAggregateFrontendLockKey));
      const changedKey = yield* makeAggregateFrontendLock({
        frontend: changed,
      }).pipe(Effect.flatMap(makeAggregateFrontendLockKey));

      expect(changedKey).not.toBe(baselineKey);
    }),
  );
});
