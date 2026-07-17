import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeActorController } from '../actorController/makeActorController.ts';
import type { IActorControllers } from '../actorController/types.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeSelection } from '../models/makeSelection.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { makeAccountId } from '../utils/makeAccountId.ts';

import { makeAccountController } from './makeAccountController.ts';

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

const Invoice = makeModel(
  {
    abbreviation: 'inv',
    modelName: 'invoice',
    attributes: {
      total: primitives.number(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const UserWithEmail = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      email: primitives.text(),
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const VersionedInvoice = makeModel(
  {
    abbreviation: 'vinv',
    modelName: 'versionedInvoice',
    attributes: {
      total: primitives.number(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'vinv',
      modelName: 'versionedInvoice',
      attributes: {
        total: primitives.number(),
      },
      indexes: [],
      version: '1.0.0',
    },
  ],
);

const RetiredInvoice = makeModel(
  {
    abbreviation: 'rinv',
    modelName: 'retiredInvoice',
    attributes: {
      total: primitives.number(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const authenticate = () =>
  Effect.succeed({
    actorId: 'usr_1' as const,
    accountId: 'acct_1' as const,
  });

describe('makeAccountController', () => {
  it('returns actorControllers map on the account and stamps accountName on commands', async () => {
    const createUser = makeContract({
      commandName: 'createUser',
      payload: { id: User.primaryKey({ autogenerate: false }) },
      mutations: null,
      version: '1.0.0',
    });
    const frontend = makeFrontendController({
      contracts: { createUser },
      accountName: 'user',
      actorName: 'self',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test',
      models: { user: User },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const selfActor = makeActorController({
      name: 'self',
      version: '1.0.0',
      models: { user: User },
      selections: {
        user: makeSelection({ model: User }),
      },
      frontends: {
        default: {
          frontendController: frontend,
          authenticate,
        },
      },
    });
    const account = makeAccountController({
      name: 'user',
      version: '1.0.0',
      actorControllers: { self: selfActor },
      models: { user: User },
      contracts: selfActor.frontends.default.contracts,
    });

    expect(account.actorControllers.self).toBe(selfActor);

    const command = await Effect.runPromise(
      account
        .makeCommand({
          contractName: 'createUser',
          accountId: makeAccountId({ id: '1' }),
          systemName: frontend.systemName,
          systemVersion: '1.0.0',
          payload: {
            id: User.prefixId('user-1'),
          },
        })
        .pipe(
          Effect.provide(
            makePrefixedIncrementalIdFactory('makeAccountController'),
          ),
        ),
    );

    expect(command.accountName).toBe('user');
    expect(command.systemVersion).toBe('1.0.0');
  });

  it('throws when an actorControllers key does not match the actor name', () => {
    const frontend = makeFrontendController({
      contracts: {},
      accountName: 'user',
      actorName: 'self',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test',
      models: { user: User },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const selfActor = makeActorController({
      name: 'self',
      version: '1.0.0',
      models: { user: User },
      selections: { user: makeSelection({ model: User }) },
      frontends: {
        default: { frontendController: frontend, authenticate },
      },
    });
    const actorControllers = { admin: selfActor } as IActorControllers;

    expect(() =>
      makeAccountController({
        name: 'user',
        version: '1.0.0',
        actorControllers,
        models: { user: User },
        contracts: {},
      }),
    ).toThrow(
      'makeAccountController: actorControllers.admin must have name "admin", received "self"',
    );
  });

  it('throws when a frontends key does not match the frontend frontendName', () => {
    const frontend = makeFrontendController({
      contracts: {},
      accountName: 'user',
      actorName: 'self',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test',
      models: { user: User },
      signature: Schema.Struct({ userId: Schema.String }),
    });

    expect(() =>
      makeActorController({
        name: 'self',
        version: '1.0.0',
        models: { user: User },
        selections: { user: makeSelection({ model: User }) },
        frontends: {
          web: { frontendController: frontend, authenticate },
        },
      }),
    ).toThrow(/frontends\.web/);
  });

  it('throws when an actor model is missing from account models', () => {
    const frontend = makeFrontendController({
      contracts: {},
      accountName: 'user',
      actorName: 'self',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test',
      models: { invoice: Invoice },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const selfActor = makeActorController({
      name: 'self',
      version: '1.0.0',
      models: { invoice: Invoice },
      selections: { invoice: makeSelection({ model: Invoice }) },
      frontends: {
        default: { frontendController: frontend, authenticate },
      },
    });

    expect(() =>
      makeAccountController({
        name: 'user',
        version: '1.0.0',
        actorControllers: { self: selfActor } as IActorControllers,
        models: { user: User },
        contracts: {},
      }),
    ).toThrow(
      /actorControllers\.self\.models\.invoice must be the same object/,
    );
  });

  it('throws when an account model is not the exact actor model object', () => {
    const frontend = makeFrontendController({
      contracts: {},
      accountName: 'user',
      actorName: 'self',
      frontendName: 'default',
      version: '1.0.0',
      systemName: 'test',
      models: { user: UserWithEmail },
      signature: Schema.Struct({ userId: Schema.String }),
    });
    const selfActor = makeActorController({
      name: 'self',
      version: '1.0.0',
      models: { user: UserWithEmail },
      selections: { user: makeSelection({ model: UserWithEmail }) },
      frontends: {
        default: { frontendController: frontend, authenticate },
      },
    });

    expect(() =>
      makeAccountController({
        name: 'user',
        version: '1.0.0',
        actorControllers: { self: selfActor } as IActorControllers,
        models: { user: User },
        contracts: {},
      }),
    ).toThrow(/actorControllers\.self\.models\.user must be the same object/);
  });

  it('accepts one direct historical-to-current mutation adapter edge', () => {
    const mutationAdapters = {
      versionedInvoice: {
        create: [
          {
            source: VersionedInvoice.createMutation('1.0.0'),
            destination: VersionedInvoice.createMutation('2.0.0'),
            adapter: mutation =>
              Effect.succeed({
                ...mutation,
                modelVersion: '2.0.0',
              }),
          },
        ],
      },
    };

    const account = makeAccountController({
      name: 'user',
      version: '2.0.0',
      actorControllers: {},
      models: { versionedInvoice: VersionedInvoice },
      contracts: {},
      mutationAdapters,
    });

    expect(account.mutationAdapters).toBe(mutationAdapters);
  });

  it('rejects an adapter chain whose destination is historical', () => {
    expect(() =>
      makeAccountController({
        name: 'user',
        version: '2.0.0',
        actorControllers: {},
        models: { versionedInvoice: VersionedInvoice },
        contracts: {},
        mutationAdapters: {
          versionedInvoice: {
            create: [
              {
                source: VersionedInvoice.createMutation('1.0.0'),
                destination: VersionedInvoice.createMutation('1.0.0'),
                adapter: mutation => Effect.succeed(mutation),
              },
            ],
          },
        },
      }),
    ).toThrow('destination version "1.0.0" is not current version "2.0.0"');
  });

  it('rejects a discard edge that also supplies an adapter callback', () => {
    expect(() =>
      Reflect.apply(makeAccountController, undefined, [
        {
          name: 'user',
          version: '2.0.0',
          actorControllers: {},
          models: { versionedInvoice: VersionedInvoice },
          contracts: {},
          mutationAdapters: {
            versionedInvoice: {
              create: [
                {
                  source: VersionedInvoice.createMutation('1.0.0'),
                  destination: null,
                  adapter: () => Effect.void,
                },
              ],
            },
          },
        },
      ]),
    ).toThrow('null destination must omit adapter');
  });

  it('requires every account operation before a model can be retired', () => {
    expect(() =>
      makeAccountController({
        name: 'user',
        version: '2.0.0',
        actorControllers: {},
        models: {},
        contracts: {},
        mutationAdapters: {
          retiredInvoice: {
            create: [
              {
                source: RetiredInvoice.createMutation('1.0.0'),
                destination: null,
              },
            ],
          },
        },
      }),
    ).toThrow(
      'retired model "retiredInvoice" must exhaustively adapt or discard every create/update/delete/move source version',
    );

    expect(() =>
      makeAccountController({
        name: 'user',
        version: '2.0.0',
        actorControllers: {},
        models: {},
        contracts: {},
        mutationAdapters: {
          retiredInvoice: {
            create: [
              {
                source: RetiredInvoice.createMutation('1.0.0'),
                destination: null,
              },
            ],
            update: [
              {
                source: RetiredInvoice.updateMutation('1.0.0'),
                destination: null,
              },
            ],
            delete: [
              {
                source: RetiredInvoice.deleteMutation('1.0.0'),
                destination: null,
              },
            ],
            move: [
              {
                source: RetiredInvoice.moveMutation('1.0.0'),
                destination: null,
              },
            ],
          },
        },
      }),
    ).not.toThrow();
  });
});
