import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

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
  [],
);

describe('makeFrontendControllerSpec', () => {
  it('rejects a missing version before model and guard construction', () => {
    const props = {
      contracts: {},
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
      contracts: {},
      models: {
        account: Account,
        user: User,
      },
      accountName: 'user',
      actorName: 'testFrontend',
      frontendName: 'default',
      version: '1.2.3',
      systemName: 'test-system',
      signature: Schema.Struct({}),
    });

    expect(makeFrontendControllerSpec(frontend)).toMatchObject({
      actorName: 'testFrontend',
      name: 'testFrontend',
      version: '1.2.3',
      modelNames: ['account', 'user'],
    });
  });
});
