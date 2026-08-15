import { makeContract } from '../contracts/makeContract.ts';
import { primitives } from '../models/primitives.ts';
import { makeAggregateId } from '../utils/makeAggregateId.ts';

import { makeSeeds } from './makeSeeds.ts';
import { makeSystem } from './makeSystem.ts';

const createUser = makeContract({
  commandName: 'createUser',
  version: '1.0.0',
  payload: { name: primitives.text() },
  mutations: null,
});

const system = makeSystem({
  name: 'shopping',
  version: '1.0.0',
  aggregates: {
    user: {
      models: {},
      contracts: { createUser },
      selections: {},
      frontends: {},
    },
  },
});

makeSeeds({
  system,
  aggregates: {
    user: [
      system.aggregates.user.makeCommand({
        contractName: 'createUser',
        aggregateId: makeAggregateId({ id: 'user-1' }),
        systemName: 'shopping',
        payload: { name: 'Ada' },
      }),
    ],
  },
  services: {},
});

makeSeeds({
  system,
  aggregates: {
    // @ts-expect-error — aggregate seed group keys must exist on system.aggregates
    admin: [],
  },
  services: {},
});
