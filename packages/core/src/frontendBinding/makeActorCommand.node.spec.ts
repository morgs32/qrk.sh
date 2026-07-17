import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { makeActorController } from '../actorController/makeActorController.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';
import { makeAccountId } from '../utils/makeAccountId.ts';
import { prefixActorId } from '../utils/prefixActorId.ts';

import { makeActorCommand } from './makeActorCommand.ts';

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

const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: User.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, name } = payload;
    return Effect.all({
      created: User.create('1.0.0', {
        resourceId: id,
        attributes: { name },
      }),
    });
  },
  version: '1.0.0',
});

const frontend = makeFrontendController({
  accountName: 'user',
  actorName: 'main',
  frontendName: 'main',
  version: '1.0.0',
  systemName: 'test',
  models: { user: User },
  contracts: { createUser },
  signature: Schema.Struct({}),
});

const actor = makeActorController({
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
          accountId: makeAccountId({ id: '1' }),
          actorId: prefixActorId('actor-1'),
        }),
    },
  },
});

const frontendBinding = actor.frontends.main;

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeActorCommand'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('makeActorCommand', () => {
  it.layer(TestLayer)(it => {
    it.effect('builds a actor command from frontendBinding.contracts', () =>
      Effect.gen(function* () {
        const userId = User.prefixId('user-1');
        const command = yield* makeActorCommand({
          contracts: frontendBinding.contracts,
          accountName: frontend.accountName,
          actorName: frontend.actorName,
          frontendName: frontend.frontendName,
          systemName: frontend.systemName,
          systemVersion: '1.0.0',
          contractName: 'createUser',
          accountId: makeAccountId({ id: '1' }),
          actorId: prefixActorId('actor-1'),
          payload: {
            id: userId,
            name: 'Ada',
          },
        });

        expect(command.commandType).toBe('actor');
        expect(command.commandName).toBe('createUser');
        expect(command.accountName).toBe('user');
        expect(command.actorName).toBe('main');
        expect(command.frontendName).toBe('main');
        expect(command.systemVersion).toBe('1.0.0');
        expect(command.payload).toEqual({
          id: userId,
          name: 'Ada',
        });
      }),
    );

    it.effect('frontendBinding.makeCommand delegates to makeActorCommand', () =>
      Effect.gen(function* () {
        const userId = User.prefixId('user-2');
        const command = yield* frontendBinding.makeCommand({
          contractName: 'createUser',
          systemVersion: '1.0.0',
          accountId: makeAccountId({ id: '1' }),
          actorId: prefixActorId('actor-1'),
          payload: {
            id: userId,
            name: 'Bob',
          },
        });

        expect(command.commandType).toBe('actor');
        expect(command.systemVersion).toBe('1.0.0');
        expect(command.payload.name).toBe('Bob');
      }),
    );
  });
});
