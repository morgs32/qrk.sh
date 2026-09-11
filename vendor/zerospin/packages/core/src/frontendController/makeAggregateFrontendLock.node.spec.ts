import { it } from '@effect/vitest';
import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';

import {
  AggregateFrontendLockSchema,
  makeAggregateFrontendLock,
} from './makeAggregateFrontendLock.ts';
import { makeAggregateFrontendLockKey } from './makeAggregateFrontendLockKey.ts';
import { makeFrontendController } from './makeFrontendController.ts';

const Item = makeModelVersion(
  makeModel({ name: 'item', abbreviation: 'itm' }),
  {
    attributes: { title: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
);

const List = makeModelVersion(
  makeModel({ name: 'list', abbreviation: 'lst' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const renameItem = makeContractVersion(defineCommand('renameItem'), {
  version: '2.0.0',
  payload: { title: primitives.text() },
});

const createList = makeContractVersion(defineCommand('createList'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

describe('aggregate frontend lock', () => {
  it.effect(
    'encodes the complete exact selection and hashes it canonically',
    () =>
      Effect.gen(function* () {
        const left = makeFrontendController({
          authentication: authenticationFixtureFrontend.authentication,
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
          authentication: authenticationFixtureFrontend.authentication,
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
          '86c92d519ec18a25794d79276e5e3c6de4c065482eccc284e933b0a4d67450aa',
        );
        expect(leftLock).not.toHaveProperty('version');
      }),
  );

  it.effect('changes the key when an exact selected definition changes', () =>
    Effect.gen(function* () {
      const baseline = makeFrontendController({
        authentication: authenticationFixtureFrontend.authentication,
        aggregateVersion: '1.0.0',
        systemName: 'shopping',
        aggregateName: 'shopper',
        name: 'web',
        models: { item: Item },
        contracts: { renameItem: { contract: renameItem } },
      });
      const ChangedItem = makeModelVersion(
        makeModel({ name: 'item', abbreviation: 'itm' }),
        {
          attributes: { title: primitives.integer() },
          indexes: [],
          version: '2.0.0',
        },
      );
      const changed = makeFrontendController({
        authentication: authenticationFixtureFrontend.authentication,
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
