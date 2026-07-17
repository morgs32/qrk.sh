import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAccountController } from '../accountController/makeAccountController.ts';
import type { IAccountControllers } from '../accountController/types.ts';
import { makeActorController } from '../actorController/makeActorController.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';
import type { IServiceControllers } from '../service/types.ts';

import { makeSystem } from './makeSystem.ts';

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

const ServiceUser = makeServiceModel(
  {
    serviceName: 'user',
    abbreviation: 'susr',
    modelName: 'user',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const makeTestContract = (commandName: string) =>
  makeContract({
    commandName,
    payload: {
      id: User.primaryKey({ autogenerate: false }),
    },
    mutations: null,
    version: '1.0.0',
  });

describe('makeSystem', () => {
  it('keeps account contracts aligned with frontend frontend binding contracts', () => {
    const createUser = makeTestContract('createUser');
    const frontend = makeFrontendController({
      contracts: { createUser },
      accountName: 'user',
      actorName: 'main',
      frontendName: 'main',
      version: '1.0.0',
      systemName: 'test',
      models: { user: User },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const mainActor = makeActorController({
      name: 'main',
      version: '1.0.0',
      models: { user: User },
      selections: {
        user: makeSelection({ model: User }),
      },
      frontends: {
        main: {
          frontendController: frontend,
          authenticate: () =>
            Effect.succeed({
              actorId: 'usr_1' as const,
              accountId: 'usr_1' as const,
            }),
        },
      },
    });

    const system = makeSystem({
      accountControllers: {
        user: makeAccountController({
          name: 'user',
          version: '1.0.0',
          actorControllers: { main: mainActor },
          models: { user: User },
          contracts: mainActor.frontends.main.contracts,
        }),
      },
      name: 'test',
      version: '1.0.0',
    });

    expect(system.accountControllers.user.contracts.createUser).toStrictEqual(
      createUser,
    );
  });

  it('returns accounts map on the system', () => {
    const frontend = makeFrontendController({
      contracts: { createUser: makeTestContract('createUser') },
      accountName: 'user',
      actorName: 'a',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test',
      models: { user: User },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const mainActor = makeActorController({
      name: 'a',
      version: '1.0.0',
      models: { user: User },
      selections: {
        user: makeSelection({ model: User }),
      },
      frontends: {
        default: {
          frontendController: frontend,
          authenticate: () =>
            Effect.succeed({
              actorId: 'usr_1' as const,
              accountId: 'usr_1' as const,
            }),
        },
      },
    });
    const userAccount = makeAccountController({
      name: 'user',
      version: '1.0.0',
      actorControllers: { a: mainActor },
      models: { user: User },
      contracts: mainActor.frontends.default.contracts,
    });

    const system = makeSystem({
      accountControllers: { user: userAccount },
      name: 'test',
      version: '1.0.0',
    });

    expect(system.accountControllers.user).toBe(userAccount);
  });

  it('returns serviceControllers map on the system', () => {
    const createUser = makeTestContract('createUser');
    const userService = makeServiceController({
      name: 'user',
      version: '1.0.0',
      models: { user: ServiceUser },
      contracts: { createUser },
    });

    const system = makeSystem({
      accountControllers: {},
      serviceControllers: { user: userService },
      name: 'test',
      version: '1.0.0',
    });

    expect(system.serviceControllers.user).toBe(userService);
  });

  it('throws when an accountControllers key does not match the account name', () => {
    const frontend = makeFrontendController({
      contracts: { createUser: makeTestContract('createUser') },
      accountName: 'user',
      actorName: 'main',
      frontendName: 'main',
      version: '1.0.0',
      systemName: 'test',
      models: { user: User },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const mainActor = makeActorController({
      name: 'main',
      version: '1.0.0',
      models: { user: User },
      selections: {
        user: makeSelection({ model: User }),
      },
      frontends: {
        main: {
          frontendController: frontend,
          authenticate: () =>
            Effect.succeed({
              actorId: 'usr_1' as const,
              accountId: 'usr_1' as const,
            }),
        },
      },
    });
    const userAccount = makeAccountController({
      name: 'user',
      version: '1.0.0',
      actorControllers: { main: mainActor },
      models: { user: User },
      contracts: mainActor.frontends.main.contracts,
    });
    const accountControllers = {
      admin: userAccount,
    } as IAccountControllers;

    expect(() =>
      makeSystem({
        accountControllers,
        name: 'test',
        version: '1.0.0',
      }),
    ).toThrow(
      'makeSystem: accountControllers.admin must have name "admin", received "user"',
    );
  });

  it('throws when a serviceControllers key does not match the service name', () => {
    const createUser = makeTestContract('createUser');
    const userService = makeServiceController({
      name: 'user',
      version: '1.0.0',
      models: { user: ServiceUser },
      contracts: { createUser },
    });
    const serviceControllers = {
      app: userService,
    } as IServiceControllers;

    expect(() =>
      makeSystem({
        accountControllers: {},
        serviceControllers,
        name: 'test',
        version: '1.0.0',
      }),
    ).toThrow(
      'makeSystem: serviceControllers.app must have name "app", received "user"',
    );
  });
});
