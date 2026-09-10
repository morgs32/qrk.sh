import { primitives } from '@zerospin/schema';

import { contracts } from '../contracts/index.ts';

import { models } from './index.ts';

const UserModel = models.makeModel({ name: 'user', abbreviation: 'usr' });

const User = models.makeVersion(UserModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

// @ts-expect-error Model payload-key wrappers have been removed.
void models.primaryKey;

primitives.foreignKey({
  abbreviation: UserModel.abbreviation,
  // @ts-expect-error Foreign keys require callers to supply IDs.
  autogenerate: true,
});

contracts.makeVersion(contracts.makeCommand('rawPrimaryKeyPayload'), {
  payload: {
    // @ts-expect-error CoreTypeError — raw table primary keys are not payload descriptors
    id: primitives.primaryKey({ abbreviation: 'raw' }),
  },
  mutations: null,
  version: '1.0.0',
});

contracts.makeVersion(contracts.makeCommand('refPayload'), {
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
