import { it } from '@effect/vitest';
import { Effect, Either, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { List, User, userAccount } from '../fixtures/system.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

import { makeSeeds } from './makeSeeds.ts';
import { makeSystem } from './makeSystem.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
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

const createProduct = makeContract({
  commandName: 'createProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Product.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Product.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
        },
      }),
    }),
  version: '1.0.0',
});

const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: { createProduct },
});

const seedSystem = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  serviceControllers: {
    app: appService,
  },
  name: 'system-worker',
  version: '1.0.1',
});

describe('makeSeeds', () => {
  it.layer(makePrefixedIncrementalIdFactory('makeSeeds'))(it => {
    it.effect(
      'preserves account-first ordering, property ordering, command ordering, and object identity',
      () =>
        Effect.gen(function* () {
          const firstAccountCommand = yield* userAccount.makeCommand({
            accountId: 'account-1',
            systemName: seedSystem.name,
            systemVersion: seedSystem.version,
            contractName: 'createList',
            payload: {
              id: List.prefixId('first-list'),
              name: 'First list',
              userId: User.prefixId('first-user'),
            },
          });
          const secondAccountCommand = yield* userAccount.makeCommand({
            accountId: 'account-2',
            systemName: seedSystem.name,
            systemVersion: seedSystem.version,
            contractName: 'createList',
            payload: {
              id: List.prefixId('second-list'),
              name: 'Second list',
              userId: User.prefixId('second-user'),
            },
          });
          const firstServiceCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: seedSystem.version,
            payload: {
              id: Product.prefixId('first-product'),
              name: 'First product',
            },
          });
          const secondServiceCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: seedSystem.version,
            payload: {
              id: Product.prefixId('second-product'),
              name: 'Second product',
            },
          });

          const seeds = yield* makeSeeds({
            system: seedSystem,
            accounts: {
              user: [
                Effect.succeed(firstAccountCommand),
                Effect.succeed(secondAccountCommand),
              ],
            },
            services: {
              app: [
                Effect.succeed(firstServiceCommand),
                Effect.succeed(secondServiceCommand),
              ],
            },
          });

          expect(seeds).toEqual([
            firstAccountCommand,
            secondAccountCommand,
            firstServiceCommand,
            secondServiceCommand,
          ]);
          expect(seeds[0]).toBe(firstAccountCommand);
          expect(seeds[1]).toBe(secondAccountCommand);
          expect(seeds[2]).toBe(firstServiceCommand);
          expect(seeds[3]).toBe(secondServiceCommand);
          expect(seeds[0]).toMatchObject({ accountId: 'account-1' });
          expect(seeds[1]).toMatchObject({ accountId: 'account-2' });
        }),
    );

    it.effect('rejects an empty account group', () =>
      Effect.gen(function* () {
        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: {
            user: [],
          },
          services: {},
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.code).toBe('invalid-seeds');
          expect(result.left.message).toContain(
            'Seed account group "user" must contain at least one command',
          );
        }
      }),
    );

    it.effect('rejects an empty service group', () =>
      Effect.gen(function* () {
        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: {},
          services: {
            app: [],
          },
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.code).toBe('invalid-seeds');
          expect(result.left.message).toContain(
            'Seed service group "app" must contain at least one command',
          );
        }
      }),
    );

    it.effect('rejects a runtime account group absent from the system', () =>
      Effect.gen(function* () {
        const accountCommand = yield* userAccount.makeCommand({
          accountId: 'account-1',
          systemName: seedSystem.name,
          systemVersion: seedSystem.version,
          contractName: 'createList',
          payload: {
            id: List.prefixId('unknown-group-list'),
            name: 'Unknown group',
            userId: User.prefixId('unknown-group-user'),
          },
        });
        const accountGroups = {};
        Object.defineProperty(accountGroups, 'unknown', {
          enumerable: true,
          value: [Effect.succeed(accountCommand)],
        });

        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: accountGroups,
          services: {},
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.message).toContain(
            'Seed account group "unknown" does not exist',
          );
        }
      }),
    );

    it.effect(
      'rejects an account command whose accountName misses its group',
      () =>
        Effect.gen(function* () {
          const accountCommand = yield* userAccount.makeCommand({
            accountId: 'account-1',
            systemName: seedSystem.name,
            systemVersion: seedSystem.version,
            contractName: 'createList',
            payload: {
              id: List.prefixId('bad-account-name-list'),
              name: 'Bad account name',
              userId: User.prefixId('bad-account-name-user'),
            },
          });
          Reflect.set(accountCommand, 'accountName', 'admin');

          const result = yield* makeSeeds({
            system: seedSystem,
            accounts: {
              user: [Effect.succeed(accountCommand)],
            },
            services: {},
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left.message).toContain(
              'Seed account group "user" received accountName "admin"',
            );
          }
        }),
    );

    it.effect(
      'rejects a service command whose serviceName misses its group',
      () =>
        Effect.gen(function* () {
          const serviceCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: seedSystem.version,
            payload: {
              id: Product.prefixId('bad-service-name-product'),
              name: 'Bad service name',
            },
          });
          Reflect.set(serviceCommand, 'serviceName', 'catalog');

          const result = yield* makeSeeds({
            system: seedSystem,
            accounts: {},
            services: {
              app: [Effect.succeed(serviceCommand)],
            },
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left.message).toContain(
              'Seed service group "app" received serviceName "catalog"',
            );
          }
        }),
    );

    it.effect('rejects an account command for another system', () =>
      Effect.gen(function* () {
        const accountCommand = yield* userAccount.makeCommand({
          accountId: 'account-1',
          systemName: 'another-system',
          systemVersion: seedSystem.version,
          contractName: 'createList',
          payload: {
            id: List.prefixId('bad-system-list'),
            name: 'Bad system',
            userId: User.prefixId('bad-system-user'),
          },
        });

        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: {
            user: [Effect.succeed(accountCommand)],
          },
          services: {},
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.message).toContain(
            'received systemName "another-system" instead of "system-worker"',
          );
        }
      }),
    );

    it.effect(
      'rejects an account command missing decoded provenance fields',
      () =>
        Effect.gen(function* () {
          const accountCommand = yield* userAccount.makeCommand({
            accountId: 'account-1',
            systemName: seedSystem.name,
            systemVersion: seedSystem.version,
            contractName: 'createList',
            payload: {
              id: List.prefixId('missing-provenance-list'),
              name: 'Missing provenance',
              userId: User.prefixId('missing-provenance-user'),
            },
          });
          Reflect.deleteProperty(accountCommand, 'sessionId');

          const result = yield* makeSeeds({
            system: seedSystem,
            accounts: {
              user: [Effect.succeed(accountCommand)],
            },
            services: {},
          }).pipe(Effect.either);

          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left.code).toBe('invalid-seeds');
            expect(result.left.message).toContain(
              'Invalid command in seed account group "user"',
            );
            expect(result.left.message).toContain('sessionId');
          }
        }),
    );

    it.effect('ignores inherited account and service groups', () =>
      Effect.gen(function* () {
        const accountCommand = yield* userAccount.makeCommand({
          accountId: 'account-1',
          systemName: seedSystem.name,
          systemVersion: seedSystem.version,
          contractName: 'createList',
          payload: {
            id: List.prefixId('inherited-list'),
            name: 'Inherited list',
            userId: User.prefixId('inherited-user'),
          },
        });
        const serviceCommand = yield* appService.makeCommand({
          contractName: 'createProduct',
          systemVersion: seedSystem.version,
          payload: {
            id: Product.prefixId('inherited-product'),
            name: 'Inherited product',
          },
        });
        const accountGroups = {};
        const serviceGroups = {};
        Object.setPrototypeOf(accountGroups, {
          user: [Effect.succeed(accountCommand)],
        });
        Object.setPrototypeOf(serviceGroups, {
          app: [Effect.succeed(serviceCommand)],
        });

        const resolvedSeeds = yield* makeSeeds({
          system: seedSystem,
          accounts: accountGroups,
          services: serviceGroups,
        });

        expect(resolvedSeeds).toEqual([]);
      }),
    );

    it.effect('rejects the wrong command type in an account group', () =>
      Effect.gen(function* () {
        const accountCommand = yield* userAccount.makeCommand({
          accountId: 'account-1',
          systemName: seedSystem.name,
          systemVersion: seedSystem.version,
          contractName: 'createList',
          payload: {
            id: List.prefixId('bad-type-list'),
            name: 'Bad type',
            userId: User.prefixId('bad-type-user'),
          },
        });
        Reflect.set(accountCommand, 'commandType', 'service');
        Reflect.set(accountCommand, 'serviceName', 'app');

        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: {
            user: [Effect.succeed(accountCommand)],
          },
          services: {},
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.message).toContain(
            'Seed account group "user" received command type "service"',
          );
        }
      }),
    );

    it.effect('rejects an unknown command name', () =>
      Effect.gen(function* () {
        const serviceCommand = yield* appService.makeCommand({
          contractName: 'createProduct',
          systemVersion: seedSystem.version,
          payload: {
            id: Product.prefixId('unknown-command-product'),
            name: 'Unknown command',
          },
        });
        Reflect.set(serviceCommand, 'commandName', 'archiveProduct');

        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: {},
          services: {
            app: [Effect.succeed(serviceCommand)],
          },
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.message).toContain(
            'has no contract for command "archiveProduct" version "1.0.0"',
          );
        }
      }),
    );

    it.effect('rejects an unknown command version', () =>
      Effect.gen(function* () {
        const serviceCommand = yield* appService.makeCommand({
          contractName: 'createProduct',
          systemVersion: seedSystem.version,
          payload: {
            id: Product.prefixId('unknown-version-product'),
            name: 'Unknown version',
          },
        });
        Reflect.set(serviceCommand, 'version', '2.0.0');

        const result = yield* makeSeeds({
          system: seedSystem,
          accounts: {},
          services: {
            app: [Effect.succeed(serviceCommand)],
          },
        }).pipe(Effect.either);

        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.message).toContain(
            'has no contract for command "createProduct" version "2.0.0"',
          );
        }
      }),
    );
  });
});
