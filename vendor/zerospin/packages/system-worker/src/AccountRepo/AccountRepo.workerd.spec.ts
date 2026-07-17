/*
 * System-worker annotation:
 * Exercises the Account Repo.workerd.spec behavior through the local test/runtime harness.
 * The assertions document expected integration behavior; avoid broad rewrites while changing production code.
 */

import { it } from '@effect/vitest';
import { makeAccountCommand } from '@zerospin/core/accountController/makeAccountCommand';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IPushedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { dutils } from '@zerospin/core/utils/dutils';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { asc, eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AccountBlockRepo } from '../AccountBlockRepo/AccountBlockRepo.js';
import { getAccountBlockRepo } from '../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { ActorBlockRepo } from '../ActorBlockRepo/ActorBlockRepo.js';
import { getActorBlockRepo } from '../ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
import { ActorRepo } from '../ActorRepo/ActorRepo.js';
import { getActorRepo } from '../ActorRepo/getActorRepo/getActorRepo.js';
import { main, mainModels, system, userAccount } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { getServiceBlockRepo } from '../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../ServiceRepo/ServiceRepo.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { AccountRepo } from './AccountRepo.js';
import { getAccountRepo } from './getAccountRepo/getAccountRepo.js';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('AccountRepo'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('AccountRepo', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates a frontend signature against account resources',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'account-repo-authenticate' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(0);

                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'AccountRepo authenticated user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          const actor = yield* makeAsync(() =>
            accountRepo.authenticate({
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
              signature: { userId },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(actor).toEqual({
            accountId: 'acct_1',
            actorId,
          });
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'returns the frontend authenticationentication failure for missing users',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-authenticate-missing-user',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });

          const error = yield* Effect.flip(
            makeAsync(() =>
              accountRepo.authenticate({
                accountName: main.accountName,
                actorName: main.actorName,
                frontendName: main.frontendName,
                signature: { userId },
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          );

          expect(error.code).toBe('user-not-found');
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'fails replication when the canonical service resource does not exist',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-missing-replicated-resource',
          });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const existingProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const seedTime = new Date(0);
          const command = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'replicateProduct',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            systemVersion: system.version,
            payload: {
              product: {
                id: productId,
                modelName: 'product',
                name: 'Missing service product',
                version: '1.0.0',
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          const serviceRepo = yield* getServiceRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
            },
          });
          yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                {
                  id: 'cmd_missing_replication_seed_watermark',
                  commandName: 'createProduct',
                  payload: {
                    id: existingProductId,
                    name: 'Existing product establishes W',
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'app',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const block = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [command],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          expect(block.executedCommands).toEqual([]);
          expect(block.failedCommands).toHaveLength(1);
          expect(block.failedCommands[0]?.failure).toContain(
            'replicated-service-resource-not-found',
          );
          expect(block.appliedMutations).toEqual([]);
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'aligns two services before snapshots and fails only the owning command atomically',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-grouped-service-alignment',
          });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const failedListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const existingProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const newProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const missingProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const existingStockId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.stock.abbreviation,
          });
          const newStockId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.stock.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          const appServiceRepo = yield* getServiceRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
            },
          });
          const inventoryServiceRepo = yield* getServiceRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'inventory',
            },
          });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'Grouped alignment user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          const appCreateCommands: IServiceCommand[] = [
            {
              id: 'cmd_grouped_create_existing_product',
              commandName: 'createProduct',
              payload: {
                id: existingProductId,
                name: 'Existing product at C',
              },
              version: '1.0.0',
              systemVersion: system.version,
              commandType: 'service',
              serviceName: 'app',
            },
            {
              id: 'cmd_grouped_create_new_product',
              commandName: 'createProduct',
              payload: {
                id: newProductId,
                name: 'New product snapshot at W',
              },
              version: '1.0.0',
              systemVersion: system.version,
              commandType: 'service',
              serviceName: 'app',
            },
          ];
          const inventoryCreateCommands: IServiceCommand[] = [
            {
              id: 'cmd_grouped_create_existing_stock',
              commandName: 'createStock',
              payload: {
                id: existingStockId,
                quantity: 5,
              },
              version: '1.0.0',
              systemVersion: system.version,
              commandType: 'service',
              serviceName: 'inventory',
            },
            {
              id: 'cmd_grouped_create_new_stock',
              commandName: 'createStock',
              payload: {
                id: newStockId,
                quantity: 9,
              },
              version: '1.0.0',
              systemVersion: system.version,
              commandType: 'service',
              serviceName: 'inventory',
            },
          ];
          const appCreateResult = yield* makeAsync(() =>
            appServiceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: appCreateCommands,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            inventoryServiceRepo.finalizeServiceCommands({
              serviceName: 'inventory',
              commands: inventoryCreateCommands,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const canonicalRows = yield* Effect.promise(() =>
            Promise.all([
              executeInRepo({
                managedRuntime,
                getRepo: getServiceRepo,
                repo: ServiceRepo,
                key: {
                  generationId: 'gen_test',
                  serviceName: 'app',
                },
                fn: ({ db, schema }) => ({
                  existingProduct: db
                    .select()
                    .from(schema.product)
                    .where(eq(schema.product.id, existingProductId))
                    .get(),
                  newProduct: db
                    .select()
                    .from(schema.product)
                    .where(eq(schema.product.id, newProductId))
                    .get(),
                }),
              }),
              executeInRepo({
                managedRuntime,
                getRepo: getServiceRepo,
                repo: ServiceRepo,
                key: {
                  generationId: 'gen_test',
                  serviceName: 'inventory',
                },
                fn: ({ db, schema }) => ({
                  existingStock: db
                    .select()
                    .from(schema.stock)
                    .where(eq(schema.stock.id, existingStockId))
                    .get(),
                  newStock: db
                    .select()
                    .from(schema.stock)
                    .where(eq(schema.stock.id, newStockId))
                    .get(),
                }),
              }),
            ]),
          );
          const existingProduct = canonicalRows[0].existingProduct;
          const newProduct = canonicalRows[0].newProduct;
          const existingStock = canonicalRows[1].existingStock;
          const newStock = canonicalRows[1].newStock;
          if (
            existingProduct === undefined ||
            newProduct === undefined ||
            existingStock === undefined ||
            newStock === undefined
          ) {
            throw new Error('Expected canonical service fixture rows');
          }

          const initialReplication = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'replicateProductAndStock',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            systemVersion: system.version,
            payload: {
              product: existingProduct,
              stock: existingStock,
            },
          });
          const tracedAccountRepo = makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo);
          const initialBlock = yield* tracedAccountRepo
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [initialReplication],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(initialBlock.executedCommands).toHaveLength(1);

          const accountRepoName =
            yield* AccountRepo.repoUtils.nameUtils.makeName({
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            });
          yield* Effect.promise(() =>
            Promise.all([
              executeInRepo({
                managedRuntime,
                getRepo: getServiceBlockRepo,
                repo: ServiceBlockRepo,
                key: {
                  generationId: 'gen_test',
                  serviceName: 'app',
                },
                fn: ({ db, schema }) =>
                  db.delete(schema.accountSubscribers).run(),
              }),
              executeInRepo({
                managedRuntime,
                getRepo: getServiceBlockRepo,
                repo: ServiceBlockRepo,
                key: {
                  generationId: 'gen_test',
                  serviceName: 'inventory',
                },
                fn: ({ db, schema }) =>
                  db.delete(schema.accountSubscribers).run(),
              }),
            ]),
          );

          const appUpdateResult = yield* makeAsync(() =>
            appServiceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                {
                  id: 'cmd_grouped_update_existing_product',
                  commandName: 'updateProduct',
                  payload: {
                    id: existingProductId,
                    name: 'Existing product aligned through W',
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'app',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const inventoryUpdateResult = yield* makeAsync(() =>
            inventoryServiceRepo.finalizeServiceCommands({
              serviceName: 'inventory',
              commands: [
                {
                  id: 'cmd_grouped_update_existing_stock',
                  commandName: 'updateStock',
                  payload: {
                    id: existingStockId,
                    quantity: 7,
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'inventory',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const appServiceBlockRepo = yield* getServiceBlockRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
            },
          });
          const lastAppCreateCommand =
            appCreateResult.executedCommands[1] ??
            appCreateResult.executedCommands[0];
          if (lastAppCreateCommand === undefined) {
            throw new Error('Expected the app service create watermark');
          }
          yield* makeAsync(() =>
            appServiceBlockRepo.subscribeAccount({
              accountRepoName,
              accountId,
              accountName: main.accountName,
              currentServiceCursor: lastAppCreateCommand.serviceCursor,
              currentServiceIndex: lastAppCreateCommand.serviceIndex,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const missingResourceCommand = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'createListAndReplicateProduct',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            systemVersion: system.version,
            payload: {
              id: failedListId,
              name: 'Must roll back with missing product',
              userId,
              product: {
                ...newProduct,
                id: missingProductId,
                name: 'Missing canonical product',
              },
            },
          });
          const successfulReplication = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'replicateProductAndStock',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            systemVersion: system.version,
            payload: {
              product: newProduct,
              stock: newStock,
            },
          });

          const [finalBlock] = yield* Effect.promise(() =>
            Promise.all([
              managedRuntime.runPromise(
                tracedAccountRepo
                  .finalizeAccountBlock({
                    accountId,
                    accountName: main.accountName,
                    commands: [
                      missingResourceCommand,
                      successfulReplication,
                    ],
                  })
                  .pipe(
                    Effect.provideService(
                      TelemetryCollector,
                      makeTelemetryCollector(),
                    ),
                    Effect.catchAll(error => Effect.die(error)),
                  ),
              ),
              appServiceBlockRepo.drainAccountSubscribers(),
            ]),
          );

          expect(finalBlock.failedCommands).toHaveLength(1);
          expect(finalBlock.failedCommands[0]?.id).toBe(
            missingResourceCommand.id,
          );
          expect(finalBlock.failedCommands[0]?.failure).toContain(
            'replicated-service-resource-not-found',
          );
          expect(finalBlock.executedCommands).toHaveLength(1);
          expect(finalBlock.executedCommands[0]?.id).toBe(
            successfulReplication.id,
          );
          expect(finalBlock.appliedMutations).toHaveLength(2);
          expect(finalBlock.accountIndex).toBe(5);

          const accountState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => ({
                lists: db.select().from(schema.list).all(),
                products: db
                  .select()
                  .from(schema.product)
                  .orderBy(asc(schema.product.id))
                  .all(),
                stocks: db
                  .select()
                  .from(schema.stock)
                  .orderBy(asc(schema.stock.id))
                  .all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .orderBy(asc(schema.serviceSubscriptions.serviceName))
                  .all(),
                outbox: db
                  .select()
                  .from(schema.accountBlockOutbox)
                  .orderBy(asc(schema.accountBlockOutbox.accountIndex))
                  .all(),
              }),
            }),
          );

          expect(accountState.lists).toEqual([]);
          expect(accountState.products).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: existingProductId,
                name: 'Existing product aligned through W',
              }),
              expect.objectContaining({
                id: newProductId,
                name: 'New product snapshot at W',
              }),
            ]),
          );
          expect(accountState.products).toHaveLength(2);
          expect(accountState.stocks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: existingStockId,
                quantity: 7,
              }),
              expect.objectContaining({
                id: newStockId,
                quantity: 9,
              }),
            ]),
          );
          expect(accountState.stocks).toHaveLength(2);
          expect(accountState.products[0]).not.toHaveProperty('serviceIndex');
          expect(accountState.stocks[0]).not.toHaveProperty('serviceIndex');
          expect(accountState.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceCursor:
                appUpdateResult.executedCommands[0]?.serviceCursor,
              currentServiceIndex:
                appUpdateResult.executedCommands[0]?.serviceIndex,
            }),
            expect.objectContaining({
              serviceName: 'inventory',
              currentServiceCursor:
                inventoryUpdateResult.executedCommands[0]?.serviceCursor,
              currentServiceIndex:
                inventoryUpdateResult.executedCommands[0]?.serviceIndex,
            }),
          ]);
          expect(accountState.outbox.map(row => row.accountIndex)).toEqual([
            1, 2, 3, 5,
          ]);
          expect(accountState.outbox[1]?.appliedMutations).toContain(
            '"modelName":"product"',
          );
          expect(accountState.outbox[2]?.appliedMutations).toContain(
            '"modelName":"stock"',
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'keeps a flat account block outbox row after publish succeeds',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-published-block-outbox',
          });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const listId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          const actorRepoName = yield* ActorRepo.repoUtils.nameUtils.makeName({
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
          });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(0);

                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'AccountRepo outbox user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
                actorName: main.actorName,
                actorId,
              },
              fn: () => undefined,
            }),
          );

          const command = yield* userAccount.makeCommand({
            contractName: 'createList',
            accountId,
            systemName: main.systemName,
            systemVersion: system.version,
            payload: {
              id: listId,
              name: 'AccountRepo outbox list',
              userId,
            },
          });

          const accountBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [command],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          expect(accountBlock.executedCommands.map(row => row.id)).toEqual([
            command.id,
          ]);
          expect(accountBlock.pushedBlockId).toBeNull();
          expect(accountBlock.executedCommands[0]?.accountCursor).toMatch(
            /^acur_/,
          );
          expect(accountBlock.executedCommands[0]?.accountIndex).toBe(1);
          expect(accountBlock.failedCommands).toEqual([]);
          expect(accountBlock.appliedMutations).toHaveLength(1);
          expect(accountBlock.lastAccountCursor).toMatch(/^acur_/);
          expect(accountBlock.accountIndex).toBe(1);
          expect(accountBlock.failure).toBeNull();

          const accountOutboxRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.accountBlockOutbox).all(),
            }),
          );

          expect(accountOutboxRows).toHaveLength(1);
          expect(accountOutboxRows[0]?.lastAccountCursor).toBe(
            accountBlock.lastAccountCursor,
          );
          expect(accountOutboxRows[0]?.accountIndex).toBe(1);
          expect(accountOutboxRows[0]?.failure).toBeNull();

          const accountBlockRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountBlockRepo,
              repo: AccountBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.finalizedBlocks).all(),
            }),
          );

          expect(accountBlockRows).toHaveLength(1);
          expect(accountBlockRows[0]?.lastAccountCursor).toBe(
            accountBlock.lastAccountCursor,
          );
          expect(accountBlockRows[0]?.accountIndex).toBe(1);

          const accountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const accountBlockSubscriberRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountBlockRepo,
              repo: AccountBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.actorSubscribers).all(),
            }),
          );

          expect(accountBlockSubscriberRows).toHaveLength(1);
          expect(accountBlockSubscriberRows[0]?.actorRepoName).toBe(
            actorRepoName,
          );
          expect(accountBlockSubscriberRows[0]?.currentAccountCursor).toBe(
            accountBlock.lastAccountCursor,
          );
          expect(accountBlockSubscriberRows[0]?.currentAccountIndex).toBe(1);
          expect(accountBlockSubscriberRows[0]?.deliveryAttempts).toBe(0);
          expect(accountBlockSubscriberRows[0]?.nextRetryAt).toBeNull();
          expect(accountBlockSubscriberRows[0]?.lastDeliveryError).toBeNull();

          const actorBlockRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
                actorName: main.actorName,
                actorId,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.actorBlocks).all(),
            }),
          );

          expect(actorBlockRows).toHaveLength(1);
          expect(actorBlockRows[0]?.lastAccountCursor).toBe(
            accountBlock.lastAccountCursor,
          );
          expect(actorBlockRows[0]?.accountIndex).toBe(1);
          expect(actorBlockRows[0]?.pushedBlockId).toBeNull();
          expect(actorBlockRows[0]).not.toHaveProperty('savedAt');
          expect(actorBlockRows[0]).not.toHaveProperty('frontendBlocks');
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'finalizes a pushed block once with full mixed outcomes and actor provenance',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-finalize-pushed-block',
          });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const createdListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const missingListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'Pushed block user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
                actorName: main.actorName,
                actorId,
              },
              fn: () => undefined,
            }),
          );

          const unstagedCreate = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: createdListId,
              name: 'Created by pushed block',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const pushedCreate = {
            ...unstagedCreate,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedCreate = yield* encodeCommand({
            contract: main.contracts.createList,
            command: pushedCreate,
          });

          const unstagedUpdate = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'updateList',
            payload: {
              id: missingListId,
              name: 'Missing list',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const pushedUpdate = {
            ...unstagedUpdate,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedUpdate = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: pushedUpdate,
          });
          const pushedBlock = {
            id: yield* makeIdFromAbbreviation({ abbreviation: 'pblk' }),
            sessionId,
            admissionLastAccountCursor: null,
            commands: [encodedCreate, encodedUpdate],
          };

          const tracedAccountRepo =
            makeTraceableRpcTarget<Pick<AccountRepo, 'finalizePushedCommands'>>(
              accountRepo,
            );
          const block = yield* tracedAccountRepo
            .finalizePushedCommands({ pushedBlock })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          expect(block.pushedBlockId).toBe(pushedBlock.id);
          expect(block.executedCommands).toHaveLength(1);
          expect(block.executedCommands[0]).toMatchObject({
            ...encodedCreate,
            stagedAt: pushedCreate.stagedAt,
            stagedCursor: pushedCreate.stagedCursor,
            pushedAt: pushedCreate.pushedAt,
            pushedCursor: pushedCreate.pushedCursor,
            commandType: 'frontend',
            status: 'executed',
          });
          expect(block.failedCommands).toHaveLength(1);
          expect(block.failedCommands[0]).toMatchObject({
            ...encodedUpdate,
            stagedAt: pushedUpdate.stagedAt,
            stagedCursor: pushedUpdate.stagedCursor,
            pushedAt: pushedUpdate.pushedAt,
            pushedCursor: pushedUpdate.pushedCursor,
            commandType: 'frontend',
            status: 'failed',
          });
          expect(block.appliedMutations).toHaveLength(1);

          const repeatedBlock = yield* tracedAccountRepo
            .finalizePushedCommands({ pushedBlock })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(repeatedBlock).toMatchObject({
            pushedBlockId: block.pushedBlockId,
            lastAccountCursor: block.lastAccountCursor,
            accountIndex: block.accountIndex,
            executedCommands: block.executedCommands,
            failedCommands: block.failedCommands,
            appliedMutations: block.appliedMutations,
          });

          const accountRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => ({
                lists: db.select().from(schema.list).all(),
                outbox: db.select().from(schema.accountBlockOutbox).all(),
              }),
            }),
          );
          expect(accountRows.lists.map(row => row.id)).toEqual([createdListId]);
          expect(accountRows.outbox).toHaveLength(1);
          expect(accountRows.outbox[0]?.pushedBlockId).toBe(pushedBlock.id);

          const accountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const actorOutboxRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
                actorName: main.actorName,
                actorId,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.actorBlockOutbox).all(),
            }),
          );
          expect(actorOutboxRows).toHaveLength(1);
          expect(actorOutboxRows[0]?.pushedBlockId).toBe(pushedBlock.id);
          expect(actorOutboxRows[0]?.executedCommands).toContain(
            pushedCreate.stagedCursor,
          );
          expect(actorOutboxRows[0]?.failedCommands).toContain(
            pushedUpdate.stagedCursor,
          );

          const actorBlockRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
                actorName: main.actorName,
                actorId,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.actorBlocks).all(),
            }),
          );
          expect(actorBlockRows).toHaveLength(1);
          expect(actorBlockRows[0]?.pushedBlockId).toBe(pushedBlock.id);
          expect(actorBlockRows[0]?.executedCommands).toContain(
            pushedCreate.stagedCursor,
          );
          expect(actorBlockRows[0]?.failedCommands).toContain(
            pushedUpdate.stagedCursor,
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'trusts matching pushed guards and revalidates stale siblings in order',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-pushed-guard-watermark',
          });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const trustedListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const rejectedListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const sequentialListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'Pushed guard watermark user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          const trustedUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: trustedListId,
              name: 'invalid-name',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const trustedPushed = {
            ...trustedUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedTrusted = yield* encodeCommand({
            contract: main.contracts.createList,
            command: trustedPushed,
          });
          const trustedPushedBlock = {
            id: yield* makeIdFromAbbreviation({ abbreviation: 'pblk' }),
            sessionId,
            admissionLastAccountCursor: null,
            commands: [encodedTrusted],
          };
          const tracedAccountRepo =
            makeTraceableRpcTarget<Pick<AccountRepo, 'finalizePushedCommands'>>(
              accountRepo,
            );
          const trustedBlock = yield* tracedAccountRepo
            .finalizePushedCommands({ pushedBlock: trustedPushedBlock })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          expect(trustedBlock.executedCommands).toEqual([
            expect.objectContaining({
              id: encodedTrusted.id,
              status: 'executed',
            }),
          ]);
          expect(trustedBlock.failedCommands).toEqual([]);

          const rejectedUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: rejectedListId,
              name: 'invalid-name',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const rejectedPushed = {
            ...rejectedUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedRejected = yield* encodeCommand({
            contract: main.contracts.createList,
            command: rejectedPushed,
          });

          const sequentialCreateUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: sequentialListId,
              name: 'Created before stale update guard',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const sequentialCreatePushed = {
            ...sequentialCreateUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedSequentialCreate = yield* encodeCommand({
            contract: main.contracts.createList,
            command: sequentialCreatePushed,
          });

          const sequentialUpdateUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'updateList',
            payload: {
              id: sequentialListId,
              name: 'Updated after stale create',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const sequentialUpdatePushed = {
            ...sequentialUpdateUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedSequentialUpdate = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: sequentialUpdatePushed,
          });
          const stalePushedBlock = {
            id: yield* makeIdFromAbbreviation({ abbreviation: 'pblk' }),
            sessionId,
            admissionLastAccountCursor: null,
            commands: [
              encodedRejected,
              encodedSequentialCreate,
              encodedSequentialUpdate,
            ],
          };
          const staleBlock = yield* tracedAccountRepo
            .finalizePushedCommands({ pushedBlock: stalePushedBlock })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          expect(staleBlock.failedCommands).toEqual([
            expect.objectContaining({
              ...encodedRejected,
              accountCursor: expect.stringMatching(/^acur_/),
              accountIndex: 2,
              failedAt: expect.any(Date),
              failure: expect.stringContaining('list-name-rejected'),
              status: 'failed',
            }),
          ]);
          expect(staleBlock.executedCommands).toEqual([
            expect.objectContaining({
              id: encodedSequentialCreate.id,
              accountIndex: 3,
              status: 'executed',
            }),
            expect.objectContaining({
              id: encodedSequentialUpdate.id,
              accountIndex: 4,
              status: 'executed',
            }),
          ]);

          const repeatedTrustedBlock = yield* tracedAccountRepo
            .finalizePushedCommands({ pushedBlock: trustedPushedBlock })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(repeatedTrustedBlock).toMatchObject({
            pushedBlockId: trustedBlock.pushedBlockId,
            lastAccountCursor: trustedBlock.lastAccountCursor,
            accountIndex: trustedBlock.accountIndex,
            executedCommands: trustedBlock.executedCommands,
            failedCommands: trustedBlock.failedCommands,
            appliedMutations: trustedBlock.appliedMutations,
          });

          const accountState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => ({
                lists: db
                  .select()
                  .from(schema.list)
                  .orderBy(asc(schema.list.id))
                  .all(),
                outbox: db
                  .select()
                  .from(schema.accountBlockOutbox)
                  .orderBy(asc(schema.accountBlockOutbox.accountIndex))
                  .all(),
              }),
            }),
          );
          expect(accountState.lists).toEqual([
            expect.objectContaining({
              id: trustedListId,
              name: 'invalid-name',
            }),
            expect.objectContaining({
              id: sequentialListId,
              name: 'Updated after stale create',
            }),
          ]);
          expect(accountState.lists.map(row => row.id)).not.toContain(
            rejectedListId,
          );
          expect(accountState.outbox).toHaveLength(2);
          expect(accountState.outbox.map(row => row.accountIndex)).toEqual([
            1, 4,
          ]);
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'aligns an existing service projection before a pushed snapshot joins',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'account-repo-pushed-service-alignment',
          });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const existingProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const newProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const rejectedListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          const serviceRepo = yield* getServiceRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
            },
          });
          yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                {
                  id: 'cmd_pushed_alignment_create_existing',
                  commandName: 'createProduct',
                  payload: {
                    id: existingProductId,
                    name: 'Pushed existing product at C',
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'app',
                },
                {
                  id: 'cmd_pushed_alignment_create_new',
                  commandName: 'createProduct',
                  payload: {
                    id: newProductId,
                    name: 'Pushed new snapshot at W',
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'app',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const serviceRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: {
                generationId: 'gen_test',
                serviceName: 'app',
              },
              fn: ({ db, schema }) => ({
                existingProduct: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, existingProductId))
                  .get(),
                newProduct: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, newProductId))
                  .get(),
              }),
            }),
          );
          if (
            serviceRows.existingProduct === undefined ||
            serviceRows.newProduct === undefined
          ) {
            throw new Error('Expected pushed alignment service rows');
          }

          const initialReplication = yield* makeAccountCommand({
            contracts: userAccount.contracts,
            contractName: 'replicateProduct',
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemName: main.systemName,
            systemVersion: system.version,
            payload: { product: serviceRows.existingProduct },
          });
          const tracedAccountRepo = makeTraceableRpcTarget<
            Pick<
              AccountRepo,
              'finalizeAccountBlock' | 'finalizePushedCommands'
            >
          >(accountRepo);
          const initialBlock = yield* tracedAccountRepo
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [initialReplication],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: {
                generationId: 'gen_test',
                serviceName: 'app',
              },
              fn: ({ db, schema }) =>
                db.delete(schema.accountSubscribers).run(),
            }),
          );
          const serviceUpdate = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                {
                  id: 'cmd_pushed_alignment_update_existing',
                  commandName: 'updateProduct',
                  payload: {
                    id: existingProductId,
                    name: 'Pushed existing product aligned through W',
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'app',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const unstagedReplication = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'replicateProduct',
            payload: { product: serviceRows.newProduct },
            sessionId,
            systemVersion: system.version,
          });
          const pushedReplication = {
            ...unstagedReplication,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedReplication = yield* encodeCommand({
            contract: main.contracts.replicateProduct,
            command: pushedReplication,
          });

          const rejectedUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: rejectedListId,
              name: 'invalid-name',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const rejectedPushed = {
            ...rejectedUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            pushedAt: yield* dutils.date(),
            pushedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.pushedCursor,
            }),
            status: 'pushed',
          } satisfies IPushedCommand;
          const encodedRejected = yield* encodeCommand({
            contract: main.contracts.createList,
            command: rejectedPushed,
          });
          const pushedBlock = {
            id: yield* makeIdFromAbbreviation({ abbreviation: 'pblk' }),
            sessionId,
            admissionLastAccountCursor: initialBlock.lastAccountCursor,
            commands: [encodedReplication, encodedRejected],
          };
          const block = yield* tracedAccountRepo
            .finalizePushedCommands({ pushedBlock })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );

          expect(block.pushedBlockId).toBe(pushedBlock.id);
          expect(block.executedCommands).toHaveLength(1);
          expect(block.executedCommands[0]).toMatchObject({
            ...encodedReplication,
            stagedAt: pushedReplication.stagedAt,
            stagedCursor: pushedReplication.stagedCursor,
            pushedAt: pushedReplication.pushedAt,
            pushedCursor: pushedReplication.pushedCursor,
            status: 'executed',
          });
          expect(block.failedCommands).toEqual([
            expect.objectContaining({
              id: encodedRejected.id,
              accountIndex: 4,
              failure: expect.stringContaining('list-name-rejected'),
              status: 'failed',
            }),
          ]);
          expect(block.appliedMutations).toHaveLength(1);
          expect(block.accountIndex).toBe(4);

          const accountState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => ({
                lists: db.select().from(schema.list).all(),
                products: db
                  .select()
                  .from(schema.product)
                  .orderBy(asc(schema.product.id))
                  .all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
                outbox: db
                  .select()
                  .from(schema.accountBlockOutbox)
                  .orderBy(asc(schema.accountBlockOutbox.accountIndex))
                  .all(),
              }),
            }),
          );
          expect(accountState.products).toEqual([
            expect.objectContaining({
              id: existingProductId,
              name: 'Pushed existing product aligned through W',
            }),
            expect.objectContaining({
              id: newProductId,
              name: 'Pushed new snapshot at W',
            }),
          ]);
          expect(accountState.products[0]).not.toHaveProperty('serviceIndex');
          expect(accountState.products[1]).not.toHaveProperty('serviceIndex');
          expect(accountState.lists).toEqual([]);
          expect(accountState.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceCursor:
                serviceUpdate.executedCommands[0]?.serviceCursor,
              currentServiceIndex:
                serviceUpdate.executedCommands[0]?.serviceIndex,
            }),
          ]);
          expect(accountState.outbox.map(row => row.accountIndex)).toEqual([
            1, 2, 4,
          ]);
          expect(accountState.outbox[1]?.appliedMutations).toContain(
            '"modelName":"product"',
          );
          expect(accountState.outbox[2]?.pushedBlockId).toBe(pushedBlock.id);
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
