import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';

import { system } from './zerospin.config';

export const ada = system.aggregates.user['2.0.0'].makeCommand({
  contractName: 'createUser',
  systemName: system.name,
  aggregateId: makeAggregateId({ id: 'seed-user' }),
  payload: { name: 'Ada' },
});

export const notebook = system.services.app['2.0.0'].makeCommand({
  contractName: 'createProduct',
  payload: { name: 'Notebook' },
});
