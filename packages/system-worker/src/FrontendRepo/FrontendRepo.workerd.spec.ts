/*
 * Replicated-resource integration coverage:
 *
 * 1. ServiceRepo creates and owns the canonical resource.
 * 2. AccountRepo validates a replicateResource command against ServiceRepo.
 * 3. AccountRepo stores the canonical resource and subscribes to its service.
 * 4. ActorRepo selects the account replica into the frontend graph.
 * 5. A later service mutation returns through AccountRepo and ordinary account/actor blocks.
 */

import { it } from '@effect/vitest';
import { makeAccountCommand } from '@zerospin/core/accountController/makeAccountCommand';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PushedBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IPushedCommand,
  IServiceCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
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
import { asc, eq, like } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AccountBlockRepo } from '../AccountBlockRepo/AccountBlockRepo.js';
import { getAccountBlockRepo } from '../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { AccountRepo } from '../AccountRepo/AccountRepo.js';
import { getAccountRepo } from '../AccountRepo/getAccountRepo/getAccountRepo.js';
import { ActorBlockRepo } from '../ActorBlockRepo/ActorBlockRepo.js';
import { getActorBlockRepo } from '../ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
import { ActorRepo } from '../ActorRepo/ActorRepo.js';
import { getActorRepo } from '../ActorRepo/getActorRepo/getActorRepo.js';
import { main, mainModels, system, userAccount } from '../fixtures/system.js';
import { FrontendBlockRepo } from '../FrontendBlockRepo/FrontendBlockRepo.js';
import { getFrontendBlockRepo } from '../FrontendBlockRepo/getFrontendBlockRepo/getFrontendBlockRepo.js';
import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
import { managedRuntime } from '../managedRuntime.js';
import { getServiceBlockRepo } from '../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../ServiceRepo/ServiceRepo.js';
import type { IActorBlock } from '../types.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { bootstrap } from './bootstrap/bootstrap.js';
import { drainPushedBlockOutbox } from './drainPushedBlockOutbox/drainPushedBlockOutbox.js';
import { FrontendRepo, frontendRepoDrizzleSchemas } from './FrontendRepo.js';
import { getFrontendRepo } from './getFrontendRepo/getFrontendRepo.js';
import { handleActorBlocks } from './handleActorBlocks/handleActorBlocks.js';
import { pushCommands } from './pushCommands/pushCommands.js';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('FrontendRepo'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('FrontendRepo', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'stores a replicated service resource and applies later service blocks',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-replication' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const irrelevantProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const actorKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
          };
          const frontendKey = {
            ...actorKey,
            frontendName: main.frontendName,
          };
          const accountRepoName =
            yield* AccountRepo.repoUtils.nameUtils.makeName({
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            });
          const actorRepoName = yield* ActorRepo.repoUtils.nameUtils.makeName(
            actorKey,
          );
          const frontendRepoName =
            yield* FrontendRepo.repoUtils.nameUtils.makeName(frontendKey);
          const serviceRepoName =
            yield* ServiceRepo.repoUtils.nameUtils.makeName({
              generationId: 'gen_test',
              serviceName: 'app',
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
                    name: 'Frontend replication user',
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
              key: actorKey,
              fn: () => undefined,
            }),
          );

          const frontendRepo = yield* getFrontendRepo({ key: frontendKey });
          const initialState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(initialState.frontendIndex).toBe(0);
          expect(
            initialState.resources.find(row => row.id === productId),
          ).toBeUndefined();

          const serviceRepo = yield* getServiceRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          const createServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_replication_create',
            commandName: 'createProduct',
            payload: {
              id: productId,
              name: 'Canonical service product',
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const createResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [createServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(createResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const seedTime = new Date(1);
          const replicateCommand = yield* makeAccountCommand({
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
                name: 'Stale client seed',
                version: '1.0.0',
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const accountBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [replicateCommand],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(accountBlock.failedCommands).toEqual([]);

          const accountReplicationState = yield* Effect.promise(() =>
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
                products: db.select().from(schema.product).all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
                accountBlocks: db
                  .select()
                  .from(schema.accountBlockOutbox)
                  .all(),
              }),
            }),
          );
          expect(accountReplicationState.products).toEqual([
            expect.objectContaining({
              id: productId,
              name: 'Canonical service product',
            }),
          ]);
          expect(accountReplicationState.products[0]).not.toHaveProperty(
            'serviceIndex',
          );
          expect(accountReplicationState.subscriptions).toEqual([
            expect.objectContaining({
              serviceRepoName,
              serviceName: 'app',
              currentServiceIndex:
                createResult.executedCommands[0]?.serviceIndex,
              subscribedAt: expect.any(Date),
              failure: null,
            }),
          ]);
          expect(accountReplicationState.accountBlocks).toEqual([
            expect.objectContaining({
              accountIndex: accountBlock.accountIndex,
              publishedAt: expect.any(Date),
              failure: null,
            }),
          ]);

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

          const actorBlockRepo = yield* getActorBlockRepo({ key: actorKey });
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));

          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          const serviceBlockSubscriptionState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: { generationId: 'gen_test', serviceName: 'app' },
              fn: ({ db, schema }) => ({
                rows: db.select().from(schema.accountSubscribers).all(),
                schemaKeys: Object.keys(schema),
              }),
            }),
          );
          expect(serviceBlockSubscriptionState.rows).toEqual([
            expect.objectContaining({
              accountRepoName,
              accountId,
              accountName: main.accountName,
              currentServiceIndex: 1,
            }),
          ]);
          expect(serviceBlockSubscriptionState.schemaKeys).not.toContain(
            'frontendSubscribers',
          );
          const accountBlockSubscriptionRows = yield* Effect.promise(() =>
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
          expect(accountBlockSubscriptionRows).toEqual([
            expect.objectContaining({
              actorRepoName,
              actorId,
              actorName: main.actorName,
            }),
          ]);
          const actorBlockSubscriptionRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: actorKey,
              fn: ({ db, schema }) =>
                db.select().from(schema.frontendSubscribers).all(),
            }),
          );
          expect(actorBlockSubscriptionRows).toEqual([
            expect.objectContaining({
              frontendRepoName,
              frontendName: main.frontendName,
            }),
          ]);
          const frontendRetryAt = Date.now() + 60_000;
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: actorKey,
              fn: ({ db, schema }) => {
                db.update(schema.frontendSubscribers)
                  .set({
                    currentAccountCursor: null,
                    currentAccountIndex: null,
                    deliveryAttempts: 1,
                    nextRetryAt: frontendRetryAt,
                    lastDeliveryError: 'transient frontend delivery failure',
                  })
                  .where(
                    eq(
                      schema.frontendSubscribers.frontendRepoName,
                      frontendRepoName,
                    ),
                  )
                  .run();
              },
            }),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const deferredFrontendDelivery = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: actorKey,
              fn: async ({ db, schema, storage }) => ({
                subscriber: db
                  .select()
                  .from(schema.frontendSubscribers)
                  .where(
                    eq(
                      schema.frontendSubscribers.frontendRepoName,
                      frontendRepoName,
                    ),
                  )
                  .get(),
                alarm: await storage.getAlarm(),
              }),
            }),
          );
          expect(deferredFrontendDelivery.subscriber).toEqual(
            expect.objectContaining({
              frontendRepoName,
              deliveryAttempts: 1,
              nextRetryAt: frontendRetryAt,
              lastDeliveryError: 'transient frontend delivery failure',
            }),
          );
          expect(deferredFrontendDelivery.alarm).toBe(frontendRetryAt);

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: actorKey,
              fn: ({ db, schema }) => {
                db.update(schema.frontendSubscribers)
                  .set({ nextRetryAt: 0 })
                  .where(
                    eq(
                      schema.frontendSubscribers.frontendRepoName,
                      frontendRepoName,
                    ),
                  )
                  .run();
              },
            }),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const resumedFrontendDelivery = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: actorKey,
              fn: async ({ db, schema, storage }) => ({
                subscriber: db
                  .select()
                  .from(schema.frontendSubscribers)
                  .where(
                    eq(
                      schema.frontendSubscribers.frontendRepoName,
                      frontendRepoName,
                    ),
                  )
                  .get(),
                alarm: await storage.getAlarm(),
              }),
            }),
          );
          expect(resumedFrontendDelivery.subscriber).toEqual(
            expect.objectContaining({
              frontendRepoName,
              currentAccountCursor: accountBlock.lastAccountCursor,
              currentAccountIndex: accountBlock.accountIndex,
              deliveryAttempts: 0,
              nextRetryAt: null,
              lastDeliveryError: null,
            }),
          );
          expect(resumedFrontendDelivery.alarm).toBeNull();
          yield* makeAsync(() =>
            serviceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => frontendRepo.drainFrontendBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const replicatedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            replicatedState.resources.find(row => row.id === productId)?.name,
          ).toBe('Canonical service product');
          expect(
            replicatedState.resources.find(row => row.id === productId),
          ).not.toHaveProperty('serviceIndex');
          const accountSchemaKeys = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId,
                accountName: main.accountName,
              },
              fn: ({ schema }) => Object.keys(schema),
            }),
          );
          const actorSchemaKeys = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: actorKey,
              fn: ({ schema }) => Object.keys(schema),
            }),
          );
          expect(accountSchemaKeys).toContain('product');
          expect(actorSchemaKeys).toContain('product');

          const irrelevantServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_replication_irrelevant',
            commandName: 'createProduct',
            payload: {
              id: irrelevantProductId,
              name: 'Non-member service product',
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const irrelevantResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [irrelevantServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(irrelevantResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            serviceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));

          const irrelevantAccountState = yield* Effect.promise(() =>
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
                accountBlocks: db
                  .select()
                  .from(schema.accountBlockOutbox)
                  .all(),
                products: db.select().from(schema.product).all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(irrelevantAccountState.accountBlocks).toHaveLength(1);
          expect(irrelevantAccountState.products).toHaveLength(1);
          expect(irrelevantAccountState.products[0]?.id).toBe(productId);
          expect(irrelevantAccountState.subscriptions).toEqual([
            expect.objectContaining({
              currentServiceIndex:
                irrelevantResult.executedCommands[0]?.serviceIndex,
            }),
          ]);

          const updateServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_replication_update',
            commandName: 'updateProduct',
            payload: {
              id: productId,
              name: 'Updated service product',
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const updateResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [updateServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(updateResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            serviceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => frontendRepo.drainFrontendBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const synchronizedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            synchronizedState.resources.find(row => row.id === productId)?.name,
          ).toBe('Updated service product');

          const relevantAccountState = yield* Effect.promise(() =>
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
                accountBlocks: db
                  .select()
                  .from(schema.accountBlockOutbox)
                  .orderBy(schema.accountBlockOutbox.accountIndex)
                  .all(),
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, productId))
                  .get(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(relevantAccountState.accountBlocks).toHaveLength(2);
          expect(relevantAccountState.accountBlocks[1]).toEqual(
            expect.objectContaining({
              executedCommands: '[]',
              failedCommands: '[]',
              publishedAt: expect.any(Date),
              failure: null,
            }),
          );
          expect(relevantAccountState.product).toEqual(
            expect.objectContaining({
              id: productId,
              name: 'Updated service product',
            }),
          );
          expect(relevantAccountState.product).not.toHaveProperty(
            'serviceIndex',
          );
          expect(relevantAccountState.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceIndex:
                updateResult.executedCommands[0]?.serviceIndex,
            }),
          ]);

          const repeatedReplicationCommand = yield* makeAccountCommand({
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
                name: 'Repeated stale client seed',
                version: '1.0.0',
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const repeatedReplicationBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [repeatedReplicationCommand],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(repeatedReplicationBlock.failedCommands).toEqual([]);
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => frontendRepo.drainFrontendBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const deleteServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_replication_delete',
            commandName: 'deleteProduct',
            payload: { id: productId },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const deleteResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [deleteServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(deleteResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            serviceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => frontendRepo.drainFrontendBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const deletedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            deletedState.resources.find(row => row.id === productId),
          ).toBeUndefined();
          const deletedAccountState = yield* Effect.promise(() =>
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
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, productId))
                  .get(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(deletedAccountState.product).toBeUndefined();
          expect(deletedAccountState.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceIndex:
                deleteResult.executedCommands[0]?.serviceIndex,
            }),
          ]);

          const frontendBlockRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getFrontendBlockRepo,
              repo: FrontendBlockRepo,
              key: frontendKey,
              fn: ({ db, schema }) =>
                db
                  .select()
                  .from(schema.frontendBlocks)
                  .orderBy(schema.frontendBlocks.frontendIndex)
                  .all(),
            }),
          );
          expect(frontendBlockRows).toHaveLength(4);
          expect(frontendBlockRows[0]?.frontendIndex).toBe(1);
          expect(frontendBlockRows[1]?.frontendIndex).toBe(2);
          expect(frontendBlockRows[2]?.frontendIndex).toBe(3);
          expect(frontendBlockRows[3]?.frontendIndex).toBe(4);
          const replicationBlock = yield* Schema.decodeUnknown(
            Schema.parseJson(FrontendBlockSchema),
          )(frontendBlockRows[0]?.block);
          const serviceUpdateBlock = yield* Schema.decodeUnknown(
            Schema.parseJson(FrontendBlockSchema),
          )(frontendBlockRows[1]?.block);
          const repeatedReplicationFrontendBlock = yield* Schema.decodeUnknown(
            Schema.parseJson(FrontendBlockSchema),
          )(frontendBlockRows[2]?.block);
          const serviceDeleteBlock = yield* Schema.decodeUnknown(
            Schema.parseJson(FrontendBlockSchema),
          )(frontendBlockRows[3]?.block);
          expect(replicationBlock.delta.inserted).toEqual([
            expect.objectContaining({
              id: productId,
              name: 'Canonical service product',
            }),
          ]);
          expect(serviceUpdateBlock.delta.updated).toEqual([
            expect.objectContaining({
              id: productId,
              name: 'Updated service product',
            }),
          ]);
          expect(repeatedReplicationFrontendBlock.delta.inserted).toEqual([]);
          expect(repeatedReplicationFrontendBlock.delta.updated).toEqual([
            expect.objectContaining({
              id: productId,
              name: 'Updated service product',
            }),
          ]);
          expect(serviceDeleteBlock.delta.deleted).toEqual([
            { id: productId, modelName: 'product' },
          ]);
          const serviceBlockRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: { generationId: 'gen_test', serviceName: 'app' },
              fn: ({ db, schema }) =>
                db.select().from(schema.serviceBlocks).all(),
            }),
          );
          const actorBlockRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorBlockRepo,
              repo: ActorBlockRepo,
              key: actorKey,
              fn: ({ db, schema }) =>
                db.select().from(schema.actorBlocks).all(),
            }),
          );
          expect(serviceBlockRows.length).toBeGreaterThanOrEqual(2);
          expect(actorBlockRows).toHaveLength(4);
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'cold-bootstraps a service replica from AccountRepo through ActorRepo',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-cold-replication' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const serviceRepo = yield* getServiceRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          const createServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_cold_replication_create',
            commandName: 'createProduct',
            payload: {
              id: productId,
              name: 'Cold canonical service product',
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const createResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [createServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(createResult.failedCommands).toEqual([]);

          const accountRepo = yield* getAccountRepo({
            key: {
              generationId: 'gen_test',
              accountId,
              accountName: main.accountName,
            },
          });
          const seedTime = new Date(1);
          const replicateCommand = yield* makeAccountCommand({
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
                name: 'Cold stale client seed',
                version: '1.0.0',
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const accountBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [replicateCommand],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(accountBlock.failedCommands).toEqual([]);

          const actorKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
          };
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: actorKey,
              fn: () => undefined,
            }),
          );

          const actorProducts = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: actorKey,
              fn: ({ db, schema }) => db.select().from(schema.product).all(),
            }),
          );
          expect(actorProducts).toEqual([
            expect.objectContaining({
              id: productId,
              name: 'Cold canonical service product',
            }),
          ]);

          const frontendRepo = yield* getFrontendRepo({
            key: {
              ...actorKey,
              frontendName: main.frontendName,
            },
          });
          const frontendState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(frontendState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: productId,
                name: 'Cold canonical service product',
              }),
            ]),
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'deletes a replicated service resource and removes its row membership',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-delete-resource' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const actorKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
          };
          const frontendKey = {
            ...actorKey,
            frontendName: main.frontendName,
          };
          const accountRepoKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
          };

          const accountRepo = yield* getAccountRepo({ key: accountRepoKey });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: accountRepoKey,
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.user)
                  .values({
                    id: userId,
                    actorId,
                    modelName: 'user',
                    name: 'Frontend delete user',
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
              key: actorKey,
              fn: () => undefined,
            }),
          );
          const frontendRepo = yield* getFrontendRepo({ key: frontendKey });
          yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const serviceRepo = yield* getServiceRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          const createServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_delete_create',
            commandName: 'createProduct',
            payload: {
              id: productId,
              name: 'Doomed service product',
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const createResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [createServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(createResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const seedTime = new Date(1);
          const replicateCommand = yield* makeAccountCommand({
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
                name: 'Stale client seed',
                version: '1.0.0',
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const replicateBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [replicateCommand],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(replicateBlock.failedCommands).toEqual([]);

          const accountBlockRepo = yield* getAccountBlockRepo({
            key: accountRepoKey,
          });
          const actorBlockRepo = yield* getActorBlockRepo({ key: actorKey });
          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          const drainChain = Effect.gen(function* () {
            yield* makeAsync(() =>
              serviceBlockRepo.drainAccountSubscribers(),
            ).pipe(Effect.flatMap(decodeRpc));
            yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
              Effect.flatMap(decodeRpc),
            );
            yield* makeAsync(() =>
              actorBlockRepo.drainFrontendSubscribers(),
            ).pipe(Effect.flatMap(decodeRpc));
            yield* makeAsync(() =>
              frontendRepo.drainFrontendBlockOutbox(),
            ).pipe(Effect.flatMap(decodeRpc));
          });
          yield* drainChain;

          const replicatedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            replicatedState.resources.find(row => row.id === productId)?.name,
          ).toBe('Doomed service product');

          const deleteServiceCommand: IServiceCommand = {
            id: 'cmd_frontend_delete_delete',
            commandName: 'deleteProduct',
            payload: {
              id: productId,
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          };
          const deleteResult = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [deleteServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(deleteResult.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* drainChain;

          const accountDeleteState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: accountRepoKey,
              fn: ({ db, schema }) => ({
                products: db.select().from(schema.product).all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(accountDeleteState.products).toEqual([]);
          expect(accountDeleteState.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceIndex:
                deleteResult.executedCommands[0]?.serviceIndex,
            }),
          ]);

          const deletedState = yield* makeAsync(() =>
            frontendRepo.getFrontendState({
              accountId,
              accountName: main.accountName,
              actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-test',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            deletedState.resources.find(row => row.id === productId),
          ).toBeUndefined();

          const rereplicateCommand = yield* makeAccountCommand({
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
                name: 'Resurrection attempt',
                version: '1.0.0',
                createdAt: seedTime,
                updatedAt: seedTime,
              },
            },
          });
          const rereplicateBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(accountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: main.accountName,
              commands: [rereplicateCommand],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(rereplicateBlock.failedCommands).toHaveLength(1);
          expect(rereplicateBlock.executedCommands).toEqual([]);
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'classifies pending, pushed, and failed staged commands with durable session watermarks',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-push-classify' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const validListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const rejectedListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const frontendKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
            frontendName: main.frontendName,
          };
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

          const validUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: validListId,
              name: 'Accepted list',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const rejectedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const validStaged = {
            ...validUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            status: 'staged',
          } satisfies IStagedCommand;
          const encodedValid = yield* encodeCommand({
            contract: main.contracts.createList,
            command: validStaged,
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
          const rejectedStaged = {
            ...rejectedUnstaged,
            stagedCursor: rejectedStagedCursor,
            stagedAt: yield* dutils.date(),
            status: 'staged',
          } satisfies IStagedCommand;
          const encodedRejected = yield* encodeCommand({
            contract: main.contracts.createList,
            command: rejectedStaged,
          });

          const state = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getFrontendRepo,
              repo: FrontendRepo,
              key: frontendKey,
              fn: async ({ db, name, schema, storage }) => {
                const result = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [encodedValid, encodedRejected],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                const retried = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [encodedValid],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                const conflicting = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [
                      {
                        ...encodedValid,
                        stagedAt: new Date(encodedValid.stagedAt.getTime() + 1),
                      },
                    ],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                const pushedRows = db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedCommands)
                  .all();
                db.delete(frontendRepoDrizzleSchemas.pushedCommands)
                  .where(
                    eq(
                      frontendRepoDrizzleSchemas.pushedCommands.id,
                      encodedValid.id,
                    ),
                  )
                  .run();
                const processedRetry = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [encodedValid],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                return {
                  result,
                  retried,
                  conflicting,
                  processedRetry,
                  resources: db.select().from(schema.list).all(),
                  pushedRows,
                  mutationRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedMutations)
                    .all(),
                  outboxRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                    .all(),
                  processed: storage.kv.get(
                    `processedStagedCursor:${sessionId}`,
                  ),
                  terminal: storage.kv.get(`terminalStagedCursor:${sessionId}`),
                  lastRebasedPushedCursor: storage.kv.get(
                    'lastRebasedPushedCursor',
                  ),
                };
              },
            }),
          );
          const persistedPushedBlock = yield* Schema.decodeUnknown(
            Schema.parseJson(PushedBlockSchema),
          )(state.outboxRows[0]?.block);

          expect(state.result.pushedCommands).toHaveLength(1);
          expect(state.result.pendingCommands).toEqual([]);
          expect(state.result.failedCommands).toHaveLength(1);
          expect(state.result.failedCommands[0]?.id).toBe(encodedRejected.id);
          expect(state.result.failedCommands[0]?.failure).toContain(
            'list-name-rejected',
          );
          expect(state.retried.pendingCommands).toEqual([
            expect.objectContaining({
              id: state.result.pushedCommands[0]?.id,
              pushedCursor: state.result.pushedCommands[0]?.pushedCursor,
              status: 'pushed',
            }),
          ]);
          expect(state.retried.pushedCommands).toEqual([]);
          expect(state.retried.failedCommands).toEqual([]);
          expect(state.conflicting.pendingCommands).toEqual([]);
          expect(state.conflicting.pushedCommands).toEqual([]);
          expect(state.conflicting.failedCommands[0]?.failure).toContain(
            'frontend-push-staged-cursor-conflict',
          );
          expect(state.processedRetry.pendingCommands).toEqual([]);
          expect(state.processedRetry.pushedCommands).toEqual([]);
          expect(state.processedRetry.failedCommands[0]?.failure).toContain(
            'frontend-push-command-already-processed',
          );
          expect(state.resources).toEqual([
            expect.objectContaining({
              id: validListId,
              name: 'Accepted list',
            }),
          ]);
          expect(state.pushedRows).toHaveLength(1);
          expect(state.mutationRows).toHaveLength(1);
          expect(state.outboxRows).toHaveLength(1);
          expect(persistedPushedBlock.admissionLastAccountCursor).toBeNull();
          expect(state.processed).toBe(validStaged.stagedCursor);
          expect(state.terminal).toBe(rejectedStaged.stagedCursor);
          expect(state.lastRebasedPushedCursor).toBe(
            state.result.pushedCommands[0]?.pushedCursor,
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'stores the authoritative account cursor used for pushed-block admission',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({
            id: 'frontend-push-account-cursor',
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
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const accountCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.accountCursor,
          });
          const frontendKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
            frontendName: main.frontendName,
          };
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: {
                generationId: frontendKey.generationId,
                accountId,
                accountName: main.accountName,
                actorName: main.actorName,
                actorId,
              },
              fn: () => undefined,
            }),
          );

          const unstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: listId,
              name: 'Cursor-stamped list',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const staged = {
            ...unstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            status: 'staged',
          } satisfies IStagedCommand;
          const encoded = yield* encodeCommand({
            contract: main.contracts.createList,
            command: staged,
          });

          const state = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getFrontendRepo,
              repo: FrontendRepo,
              key: frontendKey,
              fn: async ({ db, name, storage }) => {
                await managedRuntime.runPromise(
                  bootstrap({
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                await managedRuntime.runPromise(
                  handleActorBlocks({
                    blocks: [
                      {
                        pushedBlockId: null,
                        executedCommands: [],
                        failedCommands: [],
                        appliedMutations: [],
                        lastAccountCursor: accountCursor,
                        accountIndex: 1,
                        deltas: {},
                      } satisfies IActorBlock,
                    ],
                    db,
                    key: frontendKey,
                    storage,
                  }),
                );
                const result = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [encoded],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                const outbox = db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .get();
                if (outbox === undefined) {
                  throw new Error('Expected a cursor-stamped pushed block');
                }
                const pushedBlock = await managedRuntime.runPromise(
                  Schema.decodeUnknown(Schema.parseJson(PushedBlockSchema))(
                    outbox.block,
                  ),
                );
                return { result, pushedBlock };
              },
            }),
          );

          expect(state.result.pushedCommands).toHaveLength(1);
          expect(state.pushedBlock.admissionLastAccountCursor).toBe(
            accountCursor,
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'rebases pending optimistic commands and keeps silent replay removals open until actor terminus',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-push-rebase' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const listId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const actorKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
          };
          const frontendKey = {
            ...actorKey,
            frontendName: main.frontendName,
          };
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getActorRepo,
              repo: ActorRepo,
              key: actorKey,
              fn: () => undefined,
            }),
          );

          const createUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: listId,
              name: 'Optimistic create',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const stagedCreate = {
            ...createUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            status: 'staged',
          } satisfies IStagedCommand;
          const encodedCreate = yield* encodeCommand({
            contract: main.contracts.createList,
            command: stagedCreate,
          });
          const updateUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'updateList',
            payload: {
              id: listId,
              name: 'Pending update',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const stagedUpdate = {
            ...updateUnstaged,
            stagedCursor: yield* makeCursor({
              abbreviation: coreAbbreviations.stagedCursor,
            }),
            stagedAt: yield* dutils.date(),
            status: 'staged',
          } satisfies IStagedCommand;
          const encodedUpdate = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: stagedUpdate,
          });

          const state = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getFrontendRepo,
              repo: FrontendRepo,
              key: frontendKey,
              fn: async ({ db, name, schema, storage }) => {
                const firstPush = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [encodedCreate],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                const firstResource = db
                  .select()
                  .from(schema.list)
                  .where(eq(schema.list.id, listId))
                  .get();
                const firstMutation = db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedMutations)
                  .where(
                    eq(
                      frontendRepoDrizzleSchemas.pushedMutations.commandId,
                      encodedCreate.id,
                    ),
                  )
                  .get();
                const firstOutbox = db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .get();
                if (
                  firstResource === undefined ||
                  firstMutation === undefined ||
                  firstOutbox === undefined ||
                  firstPush.pushedCommands[0] === undefined
                ) {
                  throw new Error('First optimistic push was not persisted');
                }

                const secondPush = await managedRuntime.runPromise(
                  pushCommands({
                    accountId,
                    accountName: main.accountName,
                    actorId,
                    actorName: main.actorName,
                    frontendName: main.frontendName,
                    commands: [encodedUpdate],
                    key: frontendKey,
                    name,
                    db,
                    storage,
                  }),
                );
                const secondOutbox = db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .all()
                  .find(row => row.id !== firstOutbox.id);
                if (
                  secondOutbox === undefined ||
                  secondPush.pushedCommands[0] === undefined
                ) {
                  throw new Error('Second optimistic push was not persisted');
                }

                const firstAccountCursor = await managedRuntime.runPromise(
                  makeCursor({
                    abbreviation: coreAbbreviations.accountCursor,
                  }),
                );
                const executedCreate = {
                  ...firstPush.pushedCommands[0],
                  mode: 'authoritative',
                  accountCursor: firstAccountCursor,
                  accountIndex: 1,
                  executedAt: await managedRuntime.runPromise(dutils.date()),
                  status: 'executed',
                } satisfies IEncodedCommand<IExecutedPushedCommand>;
                const firstActorBlock = {
                  pushedBlockId: firstOutbox.id,
                  executedCommands: [executedCreate],
                  failedCommands: [],
                  appliedMutations: [firstMutation],
                  lastAccountCursor: firstAccountCursor,
                  accountIndex: 1,
                  deltas: {
                    list: {
                      inserted: { [listId]: firstResource },
                      deleted: {},
                    },
                  },
                } satisfies IActorBlock;
                await managedRuntime.runPromise(
                  handleActorBlocks({
                    blocks: [firstActorBlock],
                    db,
                    key: frontendKey,
                    storage,
                  }),
                );
                const afterFirstTerminus = {
                  resource: db
                    .select()
                    .from(schema.list)
                    .where(eq(schema.list.id, listId))
                    .get(),
                  pushedRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedCommands)
                    .all(),
                  mutationRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedMutations)
                    .all(),
                  outboxRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                    .all(),
                };

                const secondAccountCursor = await managedRuntime.runPromise(
                  makeCursor({
                    abbreviation: coreAbbreviations.accountCursor,
                  }),
                );
                const deleteActorBlock = {
                  pushedBlockId: null,
                  executedCommands: [],
                  failedCommands: [],
                  appliedMutations: [],
                  lastAccountCursor: secondAccountCursor,
                  accountIndex: 2,
                  deltas: {
                    list: {
                      inserted: {},
                      deleted: {
                        [listId]: { id: listId, modelName: 'list' },
                      },
                    },
                  },
                } satisfies IActorBlock;
                await managedRuntime.runPromise(
                  handleActorBlocks({
                    blocks: [deleteActorBlock],
                    db,
                    key: frontendKey,
                    storage,
                  }),
                );
                const afterSilentRemoval = {
                  resource: db
                    .select()
                    .from(schema.list)
                    .where(eq(schema.list.id, listId))
                    .get(),
                  pushedRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedCommands)
                    .all(),
                  mutationRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedMutations)
                    .all(),
                  outboxRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                    .all(),
                  terminal: storage.kv.get(`terminalStagedCursor:${sessionId}`),
                };

                const thirdAccountCursor = await managedRuntime.runPromise(
                  makeCursor({
                    abbreviation: coreAbbreviations.accountCursor,
                  }),
                );
                const failedUpdate = {
                  ...secondPush.pushedCommands[0],
                  accountCursor: thirdAccountCursor,
                  accountIndex: 3,
                  failedAt: await managedRuntime.runPromise(dutils.date()),
                  failure: 'authoritative update failed',
                  status: 'failed',
                } satisfies IEncodedCommand<IFailedPushedCommand>;
                const finalActorBlock = {
                  pushedBlockId: secondOutbox.id,
                  executedCommands: [],
                  failedCommands: [failedUpdate],
                  appliedMutations: [],
                  lastAccountCursor: thirdAccountCursor,
                  accountIndex: 3,
                  deltas: {},
                } satisfies IActorBlock;
                await managedRuntime.runPromise(
                  handleActorBlocks({
                    blocks: [finalActorBlock],
                    db,
                    key: frontendKey,
                    storage,
                  }),
                );

                return {
                  firstPush,
                  secondPush,
                  afterFirstTerminus,
                  afterSilentRemoval,
                  finalOutboxRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                    .all(),
                  finalTerminal: storage.kv.get(
                    `terminalStagedCursor:${sessionId}`,
                  ),
                  frontendBlockRows: db
                    .select()
                    .from(frontendRepoDrizzleSchemas.frontendBlockOutbox)
                    .all(),
                };
              },
            }),
          );

          const optimisticReplayFailureLogs = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getSystemLogRepo,
              repo: SystemLogRepo,
              key: { generationId: frontendKey.generationId },
              fn: ({ db, schema }) =>
                db
                  .select()
                  .from(schema.telemetryLogs)
                  .where(
                    like(
                      schema.telemetryLogs.message,
                      'FrontendRepo removed pushed command%',
                    ),
                  )
                  .all(),
            }),
          );

          expect(state.firstPush.pushedCommands).toHaveLength(1);
          expect(state.secondPush.pushedCommands).toHaveLength(1);
          expect(state.afterFirstTerminus.resource).toEqual(
            expect.objectContaining({
              id: listId,
              name: 'Pending update',
            }),
          );
          expect(state.afterFirstTerminus.pushedRows).toEqual([
            expect.objectContaining({ id: encodedUpdate.id }),
          ]);
          expect(state.afterFirstTerminus.mutationRows).toHaveLength(1);
          expect(state.afterFirstTerminus.outboxRows).toEqual([
            expect.objectContaining({
              sessionId,
              finalizedAt: null,
            }),
          ]);
          expect(state.afterSilentRemoval.resource).toBeUndefined();
          expect(state.afterSilentRemoval.pushedRows).toEqual([]);
          expect(state.afterSilentRemoval.mutationRows).toEqual([]);
          expect(state.afterSilentRemoval.outboxRows).toHaveLength(1);
          expect(state.afterSilentRemoval.terminal).toBe(
            stagedCreate.stagedCursor,
          );
          expect(state.finalOutboxRows).toEqual([]);
          expect(state.finalTerminal).toBe(stagedUpdate.stagedCursor);
          expect(state.frontendBlockRows).toHaveLength(3);
          expect(optimisticReplayFailureLogs).toEqual([
            expect.objectContaining({
              level: 'warn',
              message: expect.stringContaining(
                'after optimistic replay failed',
              ),
            }),
          ]);
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'stops pushed-block delivery after three attempts and resumes in cursor order',
      () =>
        Effect.gen(function* () {
          const accountId = makeAccountId({ id: 'frontend-push-drain' });
          const actorId = yield* makeIdFromAbbreviation({
            abbreviation: 'actr',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const firstListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const secondListId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const frontendKey = {
            generationId: 'gen_test',
            accountId,
            accountName: main.accountName,
            actorName: main.actorName,
            actorId,
            frontendName: main.frontendName,
          };

          const firstUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: firstListId,
              name: 'First delivered list',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const firstPushed = {
            ...firstUnstaged,
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
          const encodedFirst = yield* encodeCommand({
            contract: main.contracts.createList,
            command: firstPushed,
          });
          const secondUnstaged = yield* main.makeUnstagedCommand({
            accountId,
            actorId,
            commandName: 'createList',
            payload: {
              id: secondListId,
              name: 'Second delivered list',
              userId,
            },
            sessionId,
            systemVersion: system.version,
          });
          const secondPushed = {
            ...secondUnstaged,
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
          const encodedSecond = yield* encodeCommand({
            contract: main.contracts.createList,
            command: secondPushed,
          });
          const firstPushedBlockId = yield* makeIdFromAbbreviation({
            abbreviation: 'pblk',
          });
          const secondPushedBlockId = yield* makeIdFromAbbreviation({
            abbreviation: 'pblk',
          });
          const rejectedPushedBlock = {
            id: firstPushedBlockId,
            sessionId,
            admissionLastAccountCursor: null,
            commands: [],
          };
          const firstPushedBlock = {
            id: firstPushedBlockId,
            sessionId,
            admissionLastAccountCursor: null,
            commands: [encodedFirst],
          };
          const secondPushedBlock = {
            id: secondPushedBlockId,
            sessionId,
            admissionLastAccountCursor: null,
            commands: [encodedSecond],
          };
          const encodedRejectedPushedBlock = yield* Schema.encode(
            Schema.parseJson(PushedBlockSchema),
          )(rejectedPushedBlock);
          const encodedFirstPushedBlock = yield* Schema.encode(
            Schema.parseJson(PushedBlockSchema),
          )(firstPushedBlock);
          const encodedSecondPushedBlock = yield* Schema.encode(
            Schema.parseJson(PushedBlockSchema),
          )(secondPushedBlock);

          const firstDrain = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getFrontendRepo,
              repo: FrontendRepo,
              key: frontendKey,
              fn: async ({ db }) => {
                db.insert(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .values([
                    {
                      id: firstPushedBlockId,
                      sessionId,
                      firstPushedCursor: firstPushed.pushedCursor,
                      block: encodedRejectedPushedBlock,
                      finalizedAt: null,
                      failure: null,
                    },
                    {
                      id: secondPushedBlockId,
                      sessionId,
                      firstPushedCursor: secondPushed.pushedCursor,
                      block: encodedSecondPushedBlock,
                      finalizedAt: null,
                      failure: null,
                    },
                  ])
                  .run();
                await managedRuntime.runPromise(
                  drainPushedBlockOutbox({ db, key: frontendKey }),
                );
                return db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .orderBy(
                    asc(
                      frontendRepoDrizzleSchemas.pushedBlockOutbox
                        .firstPushedCursor,
                    ),
                  )
                  .all();
              },
            }),
          );
          expect(firstDrain).toEqual([
            expect.objectContaining({
              id: firstPushedBlockId,
              finalizedAt: null,
              failure: expect.stringContaining('pushed-block-has-no-commands'),
            }),
            expect.objectContaining({
              id: secondPushedBlockId,
              finalizedAt: null,
              failure: null,
            }),
          ]);

          const failedAttemptTelemetry = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getSystemLogRepo,
              repo: SystemLogRepo,
              key: { generationId: frontendKey.generationId },
              fn: ({ db, schema }) =>
                db
                  .select()
                  .from(schema.telemetrySpans)
                  .where(
                    eq(
                      schema.telemetrySpans.name,
                      'AccountRepo.finalizePushedCommands.rpc',
                    ),
                  )
                  .all(),
            }),
          );
          expect(failedAttemptTelemetry).toHaveLength(3);

          const resumedDrain = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getFrontendRepo,
              repo: FrontendRepo,
              key: frontendKey,
              fn: async ({ db }) => {
                db.update(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .set({
                    block: encodedFirstPushedBlock,
                    failure: null,
                  })
                  .where(
                    eq(
                      frontendRepoDrizzleSchemas.pushedBlockOutbox.id,
                      firstPushedBlockId,
                    ),
                  )
                  .run();
                await managedRuntime.runPromise(
                  drainPushedBlockOutbox({ db, key: frontendKey }),
                );
                return db
                  .select()
                  .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                  .orderBy(
                    asc(
                      frontendRepoDrizzleSchemas.pushedBlockOutbox
                        .firstPushedCursor,
                    ),
                  )
                  .all();
              },
            }),
          );
          expect(resumedDrain).toEqual([
            expect.objectContaining({
              id: firstPushedBlockId,
              finalizedAt: expect.any(Date),
              failure: null,
            }),
            expect.objectContaining({
              id: secondPushedBlockId,
              finalizedAt: expect.any(Date),
              failure: null,
            }),
          ]);
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
