import { primitives } from '@zerospin/schema';

import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';

import { defineModel } from './defineModel.ts';
import { makeModelVersion } from './makeModelVersion.ts';

const UserModel = defineModel({ name: 'user', abbreviation: 'usr' });

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

makeContractVersion(defineContract('rawPrimaryKeyPayload'), {
  payload: {
    // @ts-expect-error CoreTypeError — raw table primary keys are not payload descriptors
    id: primitives.primaryKey({ abbreviation: 'raw' }),
  },
  mutations: null,
  version: '1.0.0',
});

makeContractVersion(defineContract('refPayload'), {
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
