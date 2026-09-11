import { primitives } from '@zerospin/schema';

import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';

import { makeModel, makeModelVersion } from './makeModel.ts';

const UserModel = makeModel({ name: 'user', abbreviation: 'usr' });

const User = makeModelVersion(UserModel, {
  attributes: {
    name: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

primitives.foreignKey({
  abbreviation: UserModel.abbreviation,
  // @ts-expect-error Foreign keys require callers to supply IDs.
  autogenerate: true,
});

makeContractVersion(defineCommand('rawPrimaryKeyPayload'), {
  payload: {
    // @ts-expect-error CoreTypeError — raw table primary keys are not payload descriptors
    id: primitives.primaryKey({ abbreviation: 'raw' }),
  },
  mutations: null,
  version: '1.0.0',
});

makeContractVersion(defineCommand('refPayload'), {
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
