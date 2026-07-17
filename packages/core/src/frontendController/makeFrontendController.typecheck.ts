import { Schema } from 'effect';

import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeFrontendController } from './makeFrontendController.ts';

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

const List = makeModel(
  {
    abbreviation: 'lst',
    modelName: 'list',
    attributes: {
      name: primitives.text(),
      userId: primitives.ref({
        table: User.table,
        relation: 'user',
        inverse: 'lists',
      }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const withModels = makeFrontendController({
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'test',
  models: {
    list: List,
    user: User,
  },
  contracts: {},
  signature: Schema.Struct({}),
});

void withModels.models.user;

makeFrontendController({
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'test',
  // @ts-expect-error CoreTypeError — models key must equal model.modelName
  models: {
    wrongKey: User,
  },
  contracts: {},
  signature: Schema.Struct({}),
});

makeFrontendController({
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'test',
  // @ts-expect-error CoreTypeError: ref target model must be in controller models
  models: {
    list: List,
  },
  contracts: {},
  signature: Schema.Struct({}),
});
