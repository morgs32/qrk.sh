import { it } from '@effect/vitest';
import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/makeModelVersion.ts';

import {
  AggregateFrontendLockSchema,
  makeAggregateFrontendLock,
} from './makeAggregateFrontendLock.ts';
import { makeAggregateFrontendLockKey } from './makeAggregateFrontendLockKey.ts';
import { makeFrontendController } from './makeFrontendController.ts';

const Item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    attributes: { title: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
);

const List = makeModelVersion(
  defineModel({ name: 'list', abbreviation: 'lst' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);

const renameItem = makeContractVersion(defineContract('renameItem'), {
  version: '2.0.0',
  payload: { title: primitives.text() },
});

const createList = makeContractVersion(defineContract('createList'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

describe('aggregate frontend lock', () => {
  it.effect(
    'encodes the complete exact selection and hashes it canonically',
    () =>
      Effect.gen(function* () {
        const left = makeFrontendController({
          authenticationSchema:
            authenticationFixtureFrontend.authentication.authenticationSchema,
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
          authenticationSchema:
            authenticationFixtureFrontend.authentication.authenticationSchema,
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
          '26beb6fbd2c04af1eeea0def5e89b97d1180925bf552368e01dcde6e0938f3fd',
        );
        expect(leftLock).not.toHaveProperty('version');
      }),
  );

  it.effect('changes the key when an exact selected definition changes', () =>
    Effect.gen(function* () {
      const baseline = makeFrontendController({
        authenticationSchema:
          authenticationFixtureFrontend.authentication.authenticationSchema,
        aggregateVersion: '1.0.0',
        systemName: 'shopping',
        aggregateName: 'shopper',
        name: 'web',
        models: { item: Item },
        contracts: { renameItem: { contract: renameItem } },
      });
      const ChangedItem = makeModelVersion(
        defineModel({ name: 'item', abbreviation: 'itm' }),
        {
          attributes: { title: primitives.integer() },
          indexes: [],
          version: '2.0.0',
        },
      );
      const changed = makeFrontendController({
        authenticationSchema:
          authenticationFixtureFrontend.authentication.authenticationSchema,
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
