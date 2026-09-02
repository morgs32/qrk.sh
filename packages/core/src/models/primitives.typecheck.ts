import { primitives } from '@zerospin/schema';

import { makeContract } from '../contracts/makeContract.ts';

import { makeModel } from './makeModel.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

// @ts-expect-error CoreTypeError — model payload keys require an explicit autogeneration decision
User.primaryKey({});

makeContract({
  commandName: 'rawPrimaryKeyPayload',
  payload: {
    // @ts-expect-error CoreTypeError — raw table primary keys are not payload descriptors
    id: primitives.primaryKey({ abbreviation: 'raw' }),
  },
  mutations: null,
  version: '1.0.0',
});

makeContract({
  commandName: 'refPayload',
  payload: {
    // @ts-expect-error CoreTypeError — refs belong to persisted table/model shapes
    userId: primitives.ref({
      table: User.table,
      relation: 'user',
      inverse: 'commands',
    }),
  },
  mutations: null,
  version: '1.0.0',
});
