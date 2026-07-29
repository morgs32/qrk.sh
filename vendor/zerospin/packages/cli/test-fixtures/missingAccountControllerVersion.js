import { makeAccountController } from '@zerospin/core/accountController/makeAccountController';
import { makeSystem } from '@zerospin/core/system/makeSystem';

const userAccount = makeAccountController({
  name: 'user',
  actorControllers: {},
  models: {},
  contracts: {},
});

export const system = makeSystem({
  accountControllers: { user: userAccount },
  name: 'invalid-version-fixture',
  version: '1.0.0',
});
