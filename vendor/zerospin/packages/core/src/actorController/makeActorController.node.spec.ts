import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  Account,
  createList,
  Item,
  List,
  main,
  User,
} from '../fixtures/system.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { primitives } from '../models/primitives.ts';

import { makeActorController } from './makeActorController.ts';

const Product = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const selections = {
  account: makeSelection({ model: Account }),
  item: makeSelection({ model: Item }),
  list: makeSelection({ model: List }),
  product: makeSelection({ model: Product }),
  user: makeSelection({ model: User }),
};
const models = {
  account: Account,
  item: Item,
  list: List,
  product: Product,
  user: User,
};

const authenticate = () =>
  Effect.succeed({
    actorId: 'actr_1' as const,
    accountId: 'acct_1' as const,
  });

describe('makeActorController frontends resolution', () => {
  it('derives binding models from actor selections shared with frontend models', () => {
    const actor = makeActorController({
      name: 'main',
      version: '1.0.0',
      models,
      selections,
      frontends: {
        main: {
          frontendController: main,
          authenticate,
        },
      },
    });

    expect(Object.keys(actor.frontends.main.models).sort()).toEqual([
      'account',
      'item',
      'list',
      'user',
    ]);
    expect(actor.frontends.main.models).not.toHaveProperty('product');
  });

  it('fills identity contract adapters for every frontend contract', () => {
    const actor = makeActorController({
      name: 'main',
      version: '1.0.0',
      models,
      selections,
      frontends: {
        main: {
          frontendController: main,
          authenticate,
        },
      },
    });
    const payload = {
      id: 'lst_1',
      name: 'x',
      userId: 'usr_1',
    };

    const adapted = Effect.runSync(
      actor.frontends.main.contractAdapters.createList({
        contract: createList,
        payload,
      }),
    );

    expect(adapted).toBe(payload);
  });

  it('throws when a frontends key does not match the frontend controller name', () => {
    expect(() =>
      makeActorController({
        name: 'main',
        version: '1.0.0',
        models,
        selections,
        frontends: {
          wrong: {
            frontendController: main,
            authenticate,
          },
        },
      }),
    ).toThrow(/frontends\.wrong/);
  });

  it('throws when a model adapter is present but model names match', () => {
    expect(() =>
      makeActorController({
        name: 'main',
        version: '1.0.0',
        models,
        selections,
        frontends: {
          main: {
            frontendController: main,
            authenticate,
            modelAdapters: {
              // @ts-expect-error — matching model names forbid an adapter
              user: resource => Effect.succeed(resource),
            },
          },
        },
      }),
    ).toThrow(/modelAdapters\.user/);
  });

  it('exposes the explicit models field on the controller', () => {
    const actor = makeActorController({
      name: 'main',
      version: '1.0.0',
      models,
      selections,
      frontends: {
        main: {
          frontendController: main,
          authenticate,
        },
      },
    });

    expect(actor.models).toBe(models);
  });

  it('rejects a missing selection at runtime', () => {
    expect(() =>
      makeActorController({
        name: 'main',
        version: '1.0.0',
        models,
        // @ts-expect-error — every model requires exactly one selection
        selections: {
          account: selections.account,
          item: selections.item,
          list: selections.list,
          product: selections.product,
        },
        frontends: {
          main: {
            frontendController: main,
            authenticate,
          },
        },
      }),
    ).toThrow(/exactly one selection for every model/);
  });

  it('rejects an extra selection at runtime', () => {
    expect(() =>
      makeActorController({
        name: 'main',
        version: '1.0.0',
        models,
        selections: {
          ...selections,
          // @ts-expect-error — selections cannot contain models outside models
          extra: makeSelection({ model: Product }),
        },
        frontends: {
          main: {
            frontendController: main,
            authenticate,
          },
        },
      }),
    ).toThrow(/exactly one selection for every model/);
  });

  it('rejects a selection under the wrong model key at runtime', () => {
    expect(() =>
      makeActorController({
        name: 'main',
        version: '1.0.0',
        models,
        selections: {
          ...selections,
          // @ts-expect-error — the user key must select the User model
          user: makeSelection({ model: Product }),
        },
        frontends: {
          main: {
            frontendController: main,
            authenticate,
          },
        },
      }),
    ).toThrow(/selections\.user\.model must be the same object/);
  });

  it('rejects a different model object with the same modelName', () => {
    const OtherProduct = makeModel(
      {
        abbreviation: 'prd',
        modelName: 'product',
        attributes: {
          name: primitives.text(),
        },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );

    expect(() =>
      makeActorController({
        name: 'main',
        version: '1.0.0',
        models,
        selections: {
          ...selections,
          // @ts-expect-error — structurally equal models still require identity
          product: makeSelection({ model: OtherProduct }),
        },
        frontends: {
          main: {
            frontendController: main,
            authenticate,
          },
        },
      }),
    ).toThrow(/selections\.product\.model must be the same object/);
  });
});
