import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import { makeFrontendControllerSpec } from './makeFrontendControllerSpec.ts';

const Account = makeModel(
  {
    abbreviation: 'acct',
    modelName: 'account',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

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
  [
    {
      abbreviation: 'usr',
      modelName: 'user',
      attributes: {
        name: primitives.text(),
      },
      indexes: [],
      version: '0.9.0',
    },
  ],
);

const readUser = makeContract(
  {
    commandName: 'readUser',
    version: '2.0.0',
    payload: { id: User.primaryKey({ autogenerate: false }) },
    mutations: null,
  },
  [
    {
      commandName: 'readUser',
      version: '1.0.0',
      payload: { userId: User.primaryKey({ autogenerate: false }) },
      adaptPayload: ({ payload }) => Effect.succeed({ id: payload.userId }),
    },
  ],
);

describe('makeFrontendControllerSpec', () => {
  it('rejects a missing version before model and guard construction', () => {
    const props = {
      contracts: { readUser },
      accountName: 'user',
      actorName: 'testFrontend',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test-system',
      signature: Schema.Struct({}),
    };
    Reflect.deleteProperty(props, 'version');

    expect(() => makeFrontendController(props)).toThrow(
      'makeFrontendController: version must be a non-empty string',
    );
  });

  it('rejects an empty version before model and guard construction', () => {
    const props = {
      contracts: {},
      accountName: 'user',
      actorName: 'testFrontend',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test-system',
      signature: Schema.Struct({}),
    };
    Reflect.set(props, 'version', '');

    expect(() => makeFrontendController(props)).toThrow(
      'makeFrontendController: version must be a non-empty string',
    );
  });

  it('includes the frontend version', () => {
    const frontend = makeFrontendController({
      contracts: { readUser },
      models: {
        account: Account,
        user: User,
      },
      accountName: 'user',
      actorName: 'testFrontend',
      frontendName: 'default',
      version: '1.2.3',
      systemName: 'test-system',
      signature: Schema.Struct({ subject: Schema.String }),
    });

    expect(makeFrontendControllerSpec(frontend)).toMatchObject({
      actorName: 'testFrontend',
      name: 'testFrontend',
      version: '1.2.3',
      modelNames: ['account', 'user'],
    });
    const spec = makeFrontendControllerSpec(frontend);
    expect(spec.models.user).toMatchObject({
      modelName: 'user',
      abbreviation: 'usr',
      version: '1.0.0',
      properties: {
        name: { kind: 'text' },
      },
      historicalDefinitions: [
        {
          modelName: 'user',
          abbreviation: 'usr',
          version: '0.9.0',
          properties: {
            name: { kind: 'text' },
          },
        },
      ],
    });
    expect(spec.contracts.readUser?.historicalDefinitions).toMatchObject([
      {
        commandName: 'readUser',
        version: '1.0.0',
        payloadJsonSchema: { type: 'object' },
      },
    ]);
    expect(spec.signatureJsonSchema).toMatchObject({ type: 'object' });
  });
});
