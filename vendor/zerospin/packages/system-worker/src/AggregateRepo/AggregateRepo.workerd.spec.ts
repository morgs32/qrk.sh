/*
 * AggregateRepo durable integration coverage below authored Dynamic execution:
 *
 * 1. Apply already-encoded service mutations to retained aggregate resources.
 * 2. Advance complete service watermarks even when a block is irrelevant.
 * 3. Persist and publish flat aggregate-block outbox rows in source order.
 *
 * Shopping workerd coverage owns contract, guard, adapter, and command encoding
 * through the statically bundled System.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedFailedServiceCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSessionCommand } from '@zerospin/core/contracts/makeSessionCommand';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AggregateBlockRepo } from '../AggregateBlockRepo/AggregateBlockRepo.js';
import { getAggregateBlockRepo } from '../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { AggregateFrontendRepo } from '../AggregateFrontendRepo/AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from '../AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { ServiceBlockSchema } from '../blockSchemas.js';
import { main, mainModels, system } from '../fixtures/system.js';
import { getAggregateFrontendState } from '../getAggregateFrontendState/getAggregateFrontendState.js';
import { managedRuntime } from '../managedRuntime.js';
import { getServiceBlockRepo } from '../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../ServiceRepo/ServiceRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from '../workerd-utils/prepareGenerationStateFixture.js';

import { AggregateRepo } from './AggregateRepo.js';
import { getAggregateRepo } from './getAggregateRepo/getAggregateRepo.js';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('AggregateRepo'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('AggregateRepo', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'aligns grouped authoritative replication before committing command outcomes',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-grouped-replication',
          });
          const generationId = activation.generationId;
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const aggregateId = makeAggregateId({
            id: 'aggregate-grouped-replication',
          });
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const productId = system.services.app.models.product.prefixId(
            'aggregate-grouped-existing-product',
          );
          const newProductId = system.services.app.models.product.prefixId(
            'aggregate-grouped-new-product',
          );
          const irrelevantProductId =
            system.services.app.models.product.prefixId(
              'aggregate-grouped-irrelevant-product',
            );
          const missingProductId = system.services.app.models.product.prefixId(
            'aggregate-grouped-missing-product',
          );
          const stockId = system.services.inventory.models.stock.prefixId(
            'aggregate-grouped-existing-stock',
          );
          const newStockId = system.services.inventory.models.stock.prefixId(
            'aggregate-grouped-new-stock',
          );
          const failedListId = system.aggregates.user.models.list.prefixId(
            'aggregate-grouped-failed-list',
          );
          const userId = system.aggregates.user.models.user.prefixId(
            'aggregate-grouped-user',
          );

          const createProduct = yield* system.services.app.makeCommand({
            contractName: 'createProduct',
            payload: { id: productId, name: 'Product at C' },
          });
          const createStock = yield* system.services.inventory.makeCommand({
            contractName: 'createStock',
            payload: { id: stockId, quantity: 1 },
          });
          const encodedCreateProduct = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command: createProduct,
          });
          const encodedCreateStock = yield* encodeCommand({
            contract: system.services.inventory.contracts.createStock,
            command: createStock,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [encodedCreateProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'inventory',
              commands: [encodedCreateStock],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const appRepo = yield* getServiceRepo({
            key: { generationId, serviceName: 'app' },
          });
          const inventoryRepo = yield* getServiceRepo({
            key: { generationId, serviceName: 'inventory' },
          });
          const appAtC = yield* makeAsync(() =>
            appRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'product', resourceId: productId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const inventoryAtC = yield* makeAsync(() =>
            inventoryRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'stock', resourceId: stockId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const productAtC = appAtC.resources[0];
          const stockAtC = inventoryAtC.resources[0];
          if (productAtC?.status !== 'found' || stockAtC?.status !== 'found') {
            return yield* Effect.die(
              new Error('Expected canonical product and stock snapshots at C'),
            );
          }

          const initialReplication = yield* system.aggregates.user.makeCommand({
            contractName: 'replicateProductAndStock',
            aggregateId,
            systemName: system.name,
            payload: {
              product: productAtC.resource,
              stock: stockAtC.resource,
            },
          });
          const encodedInitialReplication = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProductAndStock,
            command: initialReplication,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: main.aggregateName,
              commands: [encodedInitialReplication],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          for (const serviceName of ['app', 'inventory']) {
            yield* Effect.promise(() =>
              executeInRepo({
                managedRuntime,
                getRepo: getServiceBlockRepo,
                repo: ServiceBlockRepo,
                key: { generationId, serviceName },
                fn: ({ db, schema }) =>
                  db.delete(schema.aggregateSubscribers).run(),
              }),
            );
          }

          const createNewProduct = yield* system.services.app.makeCommand({
            contractName: 'createProduct',
            payload: { id: newProductId, name: 'New product at W' },
          });
          const updateExistingProduct = yield* system.services.app.makeCommand({
            contractName: 'updateProduct',
            payload: { id: productId, name: 'Existing product at W' },
          });
          const createIrrelevantProduct =
            yield* system.services.app.makeCommand({
              contractName: 'createProduct',
              payload: {
                id: irrelevantProductId,
                name: 'Never requested product',
              },
            });
          const createNewStock = yield* system.services.inventory.makeCommand({
            contractName: 'createStock',
            payload: { id: newStockId, quantity: 7 },
          });
          const updateExistingStock =
            yield* system.services.inventory.makeCommand({
              contractName: 'updateStock',
              payload: { id: stockId, quantity: 5 },
            });
          const encodedCreateNewProduct = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command: createNewProduct,
          });
          const encodedUpdateExistingProduct = yield* encodeCommand({
            contract: system.services.app.contracts.updateProduct,
            command: updateExistingProduct,
          });
          const encodedCreateIrrelevantProduct = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command: createIrrelevantProduct,
          });
          const encodedCreateNewStock = yield* encodeCommand({
            contract: system.services.inventory.contracts.createStock,
            command: createNewStock,
          });
          const encodedUpdateExistingStock = yield* encodeCommand({
            contract: system.services.inventory.contracts.updateStock,
            command: updateExistingStock,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                encodedCreateNewProduct,
                encodedUpdateExistingProduct,
                encodedCreateIrrelevantProduct,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'inventory',
              commands: [encodedCreateNewStock, encodedUpdateExistingStock],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const appAtW = yield* makeAsync(() =>
            appRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [
                { modelName: 'product', resourceId: productId },
                { modelName: 'product', resourceId: newProductId },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const inventoryAtW = yield* makeAsync(() =>
            inventoryRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'stock', resourceId: newStockId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const productAtW = appAtW.resources[0];
          const newProductAtW = appAtW.resources[1];
          const newStockAtW = inventoryAtW.resources[0];
          if (
            productAtW?.status !== 'found' ||
            newProductAtW?.status !== 'found' ||
            newStockAtW?.status !== 'found'
          ) {
            return yield* Effect.die(
              new Error('Expected canonical product and stock snapshots at W'),
            );
          }

          const duplicateProduct = yield* system.aggregates.user.makeCommand({
            contractName: 'replicateProduct',
            aggregateId,
            systemName: system.name,
            payload: { product: productAtW.resource },
          });
          const duplicateProductAgain =
            yield* system.aggregates.user.makeCommand({
              contractName: 'replicateProduct',
              aggregateId,
              systemName: system.name,
              payload: { product: productAtW.resource },
            });
          const failedCommand = yield* system.aggregates.user.makeCommand({
            contractName: 'createListAndReplicateProduct',
            aggregateId,
            systemName: system.name,
            payload: {
              id: failedListId,
              name: 'Must not commit',
              userId,
              product: { ...newProductAtW.resource, id: missingProductId },
            },
          });
          const crossServiceCommand = yield* system.aggregates.user.makeCommand(
            {
              contractName: 'replicateProductAndStock',
              aggregateId,
              systemName: system.name,
              payload: {
                product: newProductAtW.resource,
                stock: newStockAtW.resource,
              },
            },
          );
          const encodedDuplicateProduct = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProduct,
            command: duplicateProduct,
          });
          const encodedDuplicateProductAgain = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProduct,
            command: duplicateProductAgain,
          });
          const encodedFailedCommand = yield* encodeCommand({
            contract:
              system.aggregates.user.contracts.createListAndReplicateProduct,
            command: failedCommand,
          });
          const encodedCrossServiceCommand = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProductAndStock,
            command: crossServiceCommand,
          });

          const finalBlock = yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: main.aggregateName,
              commands: [
                encodedDuplicateProduct,
                encodedDuplicateProductAgain,
                encodedFailedCommand,
                encodedCrossServiceCommand,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(
            finalBlock.executedCommands.map(command => command.id),
          ).toEqual([
            duplicateProduct.id,
            duplicateProductAgain.id,
            crossServiceCommand.id,
          ]);
          expect(finalBlock.failedCommands).toEqual([
            expect.objectContaining({
              id: failedCommand.id,
              payload: expect.stringContaining(missingProductId),
            }),
          ]);
          expect(finalBlock.appliedMutations).toHaveLength(4);

          const aggregateState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => ({
                products: db.select().from(schema.product).all(),
                stocks: db.select().from(schema.stock).all(),
                lists: db.select().from(schema.list).all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
                outbox: db.select().from(schema.aggregateBlockOutbox).all(),
              }),
            }),
          );
          expect(aggregateState.products).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: productId,
                name: 'Existing product at W',
              }),
              expect.objectContaining({
                id: newProductId,
                name: 'New product at W',
              }),
            ]),
          );
          expect(aggregateState.products).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: irrelevantProductId }),
            ]),
          );
          expect(aggregateState.stocks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: stockId, quantity: 5 }),
              expect.objectContaining({ id: newStockId, quantity: 7 }),
            ]),
          );
          expect(aggregateState.lists).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: failedListId }),
            ]),
          );
          expect(aggregateState.subscriptions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                serviceName: 'app',
                currentServiceCursor: appAtW.lastServiceCursor,
                currentServiceIndex: appAtW.serviceIndex,
              }),
              expect.objectContaining({
                serviceName: 'inventory',
                currentServiceCursor: inventoryAtW.lastServiceCursor,
                currentServiceIndex: inventoryAtW.serviceIndex,
              }),
            ]),
          );
          const finalOutboxRow = aggregateState.outbox.at(-1);
          expect(finalOutboxRow).toEqual(
            expect.objectContaining({
              aggregateIndex: finalBlock.aggregateIndex,
              executedCommands: expect.stringContaining(crossServiceCommand.id),
              failedCommands: expect.stringContaining(failedCommand.id),
            }),
          );
          expect(
            aggregateState.outbox
              .filter(row => row.aggregateIndex < finalBlock.aggregateIndex)
              .slice(-2)
              .map(row => JSON.parse(row.appliedMutations)[0]?.modelName),
          ).toEqual(['product', 'stock']);
        }),
    );

    it.effect(
      'aligns pushed replication atomically and returns immutable retries',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-pushed-replication',
          });
          const generationId = activation.generationId;
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const aggregateId = makeAggregateId({
            id: 'aggregate-pushed-replication',
          });
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const productId = system.services.app.models.product.prefixId(
            'aggregate-pushed-product',
          );
          const missingProductId = system.services.app.models.product.prefixId(
            'aggregate-pushed-missing-product',
          );
          const validListId = system.aggregates.user.models.list.prefixId(
            'aggregate-pushed-valid-list',
          );
          const missingListId = system.aggregates.user.models.list.prefixId(
            'aggregate-pushed-missing-list',
          );
          const unrelatedListId = system.aggregates.user.models.list.prefixId(
            'aggregate-pushed-unrelated-list',
          );
          const userId = system.aggregates.user.models.user.prefixId(
            'aggregate-pushed-user',
          );
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });

          const createProduct = yield* system.services.app.makeCommand({
            contractName: 'createProduct',
            payload: { id: productId, name: 'Pushed product at C' },
          });
          const encodedCreateProduct = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command: createProduct,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [encodedCreateProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const appRepo = yield* getServiceRepo({
            key: { generationId, serviceName: 'app' },
          });
          const snapshotAtC = yield* makeAsync(() =>
            appRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'product', resourceId: productId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const productAtC = snapshotAtC.resources[0];
          if (productAtC?.status !== 'found') {
            return yield* Effect.die(
              new Error('Expected pushed product snapshot at C'),
            );
          }
          const initialReplication = yield* system.aggregates.user.makeCommand({
            contractName: 'replicateProduct',
            aggregateId,
            systemName: system.name,
            payload: { product: productAtC.resource },
          });
          const createUser = yield* system.aggregates.user.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: { id: userId, name: 'Pushed command owner' },
          });
          const encodedInitialReplication = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProduct,
            command: initialReplication,
          });
          const encodedCreateUser = yield* encodeCommand({
            contract: system.aggregates.user.contracts.createUser,
            command: createUser,
          });
          const initialAggregateBlock = yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: main.aggregateName,
              commands: [encodedCreateUser, encodedInitialReplication],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: { generationId, serviceName: 'app' },
              fn: ({ db, schema }) =>
                db.delete(schema.aggregateSubscribers).run(),
            }),
          );

          const updateProduct = yield* system.services.app.makeCommand({
            contractName: 'updateProduct',
            payload: { id: productId, name: 'Pushed product at W' },
          });
          const encodedUpdateProduct = yield* encodeCommand({
            contract: system.services.app.contracts.updateProduct,
            command: updateProduct,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [encodedUpdateProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const snapshotAtW = yield* makeAsync(() =>
            appRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'product', resourceId: productId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const productAtW = snapshotAtW.resources[0];
          if (productAtW?.status !== 'found') {
            return yield* Effect.die(
              new Error('Expected pushed product snapshot at W'),
            );
          }

          const stagedAt = new Date('2026-01-01T00:00:00.000Z');
          const pushedAt = new Date('2026-01-01T00:00:01.000Z');
          const validSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.createListAndReplicateProduct,
            payload: {
              id: validListId,
              name: 'Valid pushed list',
              userId,
              product: productAtW.resource,
            },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const missingSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.createListAndReplicateProduct,
            payload: {
              id: missingListId,
              name: 'Missing pushed list',
              userId,
              product: { ...productAtW.resource, id: missingProductId },
            },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const unrelatedSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.createList,
            payload: {
              id: unrelatedListId,
              name: 'Unrelated pushed list',
              userId,
            },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const pushedCommands = [];
          let replicaIndex = 0;
          for (const [command, contract] of [
            [validSessionCommand, main.contracts.createListAndReplicateProduct],
            [
              missingSessionCommand,
              main.contracts.createListAndReplicateProduct,
            ],
            [unrelatedSessionCommand, main.contracts.createList],
          ]) {
            replicaIndex += 1;
            const stagedCursor = yield* makeIdFromAbbreviation({
              abbreviation: coreAbbreviations.stagedCursor,
            });
            const pushedCursor = yield* makeIdFromAbbreviation({
              abbreviation: coreAbbreviations.pushedCursor,
            });
            pushedCommands.push(
              yield* encodeCommand({
                contract,
                command: {
                  ...command,
                  commandType: 'frontend',
                  stagedCursor,
                  stagedAt,
                  replicaIndex,
                  pushedCursor,
                  pushedAt,
                  status: 'pushed',
                },
              }),
            );
          }

          const aggregateRepo = yield* getAggregateRepo({ key: aggregateKey });
          const pushBlock = {
            writeIndex: 30,
            guardedAtAggregateCursor: initialAggregateBlock.lastAggregateCursor,
            pendingCommands: [],
            pushedCommands,
            executedCommands: [],
            failedStagedCommands: [],
            failedPushedCommands: [],
          };
          const firstFinalization = yield* makeAsync(() =>
            aggregateRepo.finalizePushBlock({
              traceContext: null,
              args: [{ pushBlock }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const stateAfterFirst = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => ({
                lists: db.select().from(schema.list).all(),
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, productId))
                  .get(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
                outbox: db.select().from(schema.aggregateBlockOutbox).all(),
              }),
            }),
          );

          expect(firstFinalization).toBeUndefined();
          expect(stateAfterFirst.lists).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: validListId }),
              expect.objectContaining({ id: unrelatedListId }),
            ]),
          );
          expect(stateAfterFirst.lists).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: missingListId }),
            ]),
          );
          expect(stateAfterFirst.product).toEqual(
            expect.objectContaining({ name: 'Pushed product at W' }),
          );
          expect(stateAfterFirst.subscriptions).toEqual([
            expect.objectContaining({
              serviceName: 'app',
              currentServiceCursor: snapshotAtW.lastServiceCursor,
              currentServiceIndex: snapshotAtW.serviceIndex,
            }),
          ]);
          expect(stateAfterFirst.outbox.at(-2)?.executedCommands).toBe('[]');
          expect(stateAfterFirst.outbox.at(-1)).toEqual(
            expect.objectContaining({
              writeIndex: pushBlock.writeIndex,
              executedCommands: expect.stringContaining(validSessionCommand.id),
              failedCommands: expect.stringContaining(missingSessionCommand.id),
            }),
          );

          const retryFinalization = yield* makeAsync(() =>
            aggregateRepo.finalizePushBlock({
              traceContext: null,
              args: [{ pushBlock }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const stateAfterRetry = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => ({
                lists: db.select().from(schema.list).all(),
                outbox: db.select().from(schema.aggregateBlockOutbox).all(),
              }),
            }),
          );
          expect(retryFinalization).toBeUndefined();
          expect(stateAfterRetry).toEqual({
            lists: stateAfterFirst.lists,
            outbox: stateAfterFirst.outbox,
          });
        }),
    );

    it.effect(
      'holds finalization through W and resumes queued delivery at W plus one',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-replication-gate',
          });
          const generationId = activation.generationId;
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const aggregateId = makeAggregateId({
            id: 'aggregate-replication-gate',
          });
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const serviceKey = { generationId, serviceName: 'app' };
          const productId = system.services.app.models.product.prefixId(
            'aggregate-replication-gate-product',
          );

          const cursorAtC = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const createdAt = new Date('2026-01-01T00:00:00.000Z');
          const terminalAtC = yield* Schema.validate(
            EncodedFailedServiceCommandSchema,
          )({
            id: 'cmd_aggregate_replication_gate_at_c',
            commandName: 'fixture',
            payload: '{}',
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
            serviceCursor: cursorAtC,
            serviceIndex: 1,
            failedAt: createdAt,
            failure: 'fixture outcome',
            status: 'failed',
          });
          const outcomeAtC = {
            commandId: terminalAtC.id,
            commandBytes: yield* Schema.encode(
              Schema.parseJson(EncodedServiceCommandSchema),
            )(terminalAtC),
            command: yield* Schema.encode(
              Schema.parseJson(EncodedFailedServiceCommandSchema),
            )(terminalAtC),
            serviceCursor: cursorAtC,
            serviceIndex: 1,
            appliedMutations: '[]',
            writeIndex: 1,
          };
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: serviceKey,
              fn: ({ db, schema }) => {
                db.insert(schema.product)
                  .values({
                    id: productId,
                    modelName: mainModels.product.modelName,
                    name: 'Product at C',
                    version: mainModels.product.version,
                    createdAt,
                    updatedAt: createdAt,
                    deletedAt: null,
                  })
                  .run();
                db.insert(schema.serviceCommandOutcomes)
                  .values(outcomeAtC)
                  .run();
              },
            }),
          );
          const serviceRepo = yield* getServiceRepo({ key: serviceKey });
          const snapshotAtC = yield* makeAsync(() =>
            serviceRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'product', resourceId: productId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const productAtC = snapshotAtC.resources[0];
          if (productAtC?.status !== 'found') {
            return yield* Effect.die(
              new Error('Expected concurrency product snapshot at C'),
            );
          }
          const initialReplication = yield* system.aggregates.user.makeCommand({
            contractName: 'replicateProduct',
            aggregateId,
            systemName: system.name,
            payload: { product: productAtC.resource },
          });
          const encodedInitialReplication = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProduct,
            command: initialReplication,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: main.aggregateName,
              commands: [encodedInitialReplication],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const aggregateRepoName =
            yield* AggregateRepo.boundDORepoConfig.nameUtils.makeName(
              aggregateKey,
            );
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) =>
                db.delete(schema.aggregateSubscribers).run(),
            }),
          );

          const cursorAtW = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const serviceIndexAtW = snapshotAtC.serviceIndex + 1;
          const productAtW = {
            ...productAtC.resource,
            name: 'Product at W',
            updatedAt: new Date('2026-01-01T00:00:01.000Z'),
          };
          const retainedMutationAtW = yield* mainModels.product.update(
            mainModels.product.version,
            {
              resourceId: productId,
              attributes: { name: 'Product at W' },
            },
          );
          const encodedRetainedMutationAtW = yield* encodeAppliedMutation({
            mutation: {
              ...retainedMutationAtW,
              commandId: 'cmd_aggregate_replication_gate_at_w',
              mutationIndex: 0,
              appliedAt: new Date('2026-01-01T00:00:01.000Z'),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });
          const retainedBlockAtW = {
            writeIndex: 35,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [encodedRetainedMutationAtW],
            lastServiceCursor: cursorAtW,
            serviceIndex: serviceIndexAtW,
          };
          const encodedRetainedBlockAtW = yield* Schema.encode(
            Schema.parseJson(ServiceBlockSchema),
          )(retainedBlockAtW);
          const terminalAtW = yield* Schema.validate(
            EncodedFailedServiceCommandSchema,
          )({
            id: 'cmd_aggregate_replication_gate_at_w',
            commandName: 'fixture',
            payload: '{}',
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
            serviceCursor: cursorAtW,
            serviceIndex: serviceIndexAtW,
            failedAt: productAtW.updatedAt,
            failure: 'fixture outcome',
            status: 'failed',
          });
          const outcomeAtW = {
            commandId: terminalAtW.id,
            commandBytes: yield* Schema.encode(
              Schema.parseJson(EncodedServiceCommandSchema),
            )(terminalAtW),
            command: yield* Schema.encode(
              Schema.parseJson(EncodedFailedServiceCommandSchema),
            )(terminalAtW),
            serviceCursor: cursorAtW,
            serviceIndex: serviceIndexAtW,
            appliedMutations: '[]',
            writeIndex: retainedBlockAtW.writeIndex,
          };
          const finalizeCommand = yield* system.aggregates.user.makeCommand({
            contractName: 'replicateProduct',
            aggregateId,
            systemName: system.name,
            payload: { product: productAtW },
          });
          const encodedFinalizeCommand = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProduct,
            command: finalizeCommand,
          });

          const cursorAfterW = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const mutationAfterW = yield* mainModels.product.update(
            mainModels.product.version,
            {
              resourceId: productId,
              attributes: { name: 'Product after W' },
            },
          );
          const encodedMutationAfterW = yield* encodeAppliedMutation({
            mutation: {
              ...mutationAfterW,
              commandId: 'cmd_aggregate_replication_gate_after_w',
              mutationIndex: 0,
              appliedAt: new Date('2026-01-01T00:00:02.000Z'),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });
          const blockAfterW = {
            writeIndex: 36,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [encodedMutationAfterW],
            lastServiceCursor: cursorAfterW,
            serviceIndex: serviceIndexAtW + 1,
          };
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) =>
                db
                  .insert(schema.aggregateSubscribers)
                  .values({
                    aggregateRepoName,
                    aggregateId,
                    aggregateName: main.aggregateName,
                    currentServiceCursor: snapshotAtC.lastServiceCursor,
                    currentServiceIndex: snapshotAtC.serviceIndex,
                    lastDeliveryError: null,
                  })
                  .run(),
            }),
          );

          let release = () => undefined;
          const released = new Promise<void>(resolve => {
            release = resolve;
          });
          const serviceHold = executeInRepo({
            managedRuntime,
            getRepo: getServiceRepo,
            repo: ServiceRepo,
            key: serviceKey,
            fn: ({ db, schema, state }) =>
              state.blockConcurrencyWhile(async () => {
                db.update(schema.product)
                  .set({
                    name: productAtW.name,
                    updatedAt: productAtW.updatedAt,
                  })
                  .where(eq(schema.product.id, productId))
                  .run();
                db.insert(schema.serviceCommandOutcomes)
                  .values(outcomeAtW)
                  .run();
                db.insert(schema.serviceBlockOutbox)
                  .values({
                    lastServiceCursor: cursorAtW,
                    serviceIndex: serviceIndexAtW,
                    block: encodedRetainedBlockAtW,
                    publishedAt: productAtW.updatedAt,
                    failure: null,
                  })
                  .run();
                await released;
              }),
          });

          const finalizationRepo = yield* getAggregateRepo({
            key: aggregateKey,
          });
          const finalization = finalizationRepo.finalizeAggregateCommands({
            traceContext: null,
            args: [
              {
                writeIndex: 40,
                aggregateId,
                aggregateName: main.aggregateName,
                commands: [encodedFinalizeCommand],
              },
            ],
          });
          const encodedBlockAfterW = yield* Schema.encode(
            Schema.parseJson(ServiceBlockSchema),
          )(blockAfterW);
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) =>
                db
                  .insert(schema.serviceBlocks)
                  .values({
                    lastServiceCursor: blockAfterW.lastServiceCursor,
                    serviceIndex: blockAfterW.serviceIndex,
                    block: encodedBlockAfterW,
                  })
                  .run(),
            }),
          );
          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: serviceKey,
          });
          const delivery = serviceBlockRepo.drainAggregateSubscribers();
          release();
          yield* Effect.promise(() => serviceHold);
          const finalized = yield* makeAsync(() => finalization).pipe(
            Effect.flatMap(envelope => decodeRpc(envelope.result)),
          );
          yield* makeAsync(() => delivery).pipe(Effect.flatMap(decodeRpc));

          const aggregateState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => ({
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, productId))
                  .get(),
                subscription: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .get(),
                outbox: db.select().from(schema.aggregateBlockOutbox).all(),
              }),
            }),
          );
          const subscriberState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) =>
                db.select().from(schema.aggregateSubscribers).get(),
            }),
          );
          expect(finalized.executedCommands).toEqual([
            expect.objectContaining({ id: finalizeCommand.id }),
          ]);
          expect(aggregateState.product).toEqual(
            expect.objectContaining({ name: 'Product after W' }),
          );
          expect(aggregateState.subscription).toEqual(
            expect.objectContaining({
              currentServiceCursor: cursorAfterW,
              currentServiceIndex: blockAfterW.serviceIndex,
            }),
          );
          expect(subscriberState).toEqual(
            expect.objectContaining({
              currentServiceCursor: cursorAfterW,
              currentServiceIndex: blockAfterW.serviceIndex,
              lastDeliveryError: null,
            }),
          );
          expect(
            aggregateState.outbox.filter(row =>
              row.appliedMutations.includes(
                'cmd_aggregate_replication_gate_after_w',
              ),
            ),
          ).toHaveLength(1);
        }),
    );

    it.effect(
      'delivers replicated service changes through the complete frontend route',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-replication-aggregate-frontend-route',
          });
          const generationId = activation.generationId;
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const aggregateId = makeAggregateId({
            id: 'aggregate-replication-aggregate-frontend-route',
          });
          const userId = system.aggregates.user.models.user.prefixId(
            'aggregate-replication-aggregate-frontend-route',
          );
          const productId = system.services.app.models.product.prefixId(
            'aggregate-replication-aggregate-frontend-route',
          );
          const stockId = system.services.inventory.models.stock.prefixId(
            'aggregate-replication-aggregate-frontend-route',
          );
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const aggregateFrontendKey = {
            ...aggregateKey,
            userId,
            frontendName: main.frontendName,
          };

          const createProduct = yield* system.services.app.makeCommand({
            contractName: 'createProduct',
            payload: { id: productId, name: 'Frontend route product' },
          });
          const createStock = yield* system.services.inventory.makeCommand({
            contractName: 'createStock',
            payload: { id: stockId, quantity: 3 },
          });
          const encodedCreateProduct = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command: createProduct,
          });
          const encodedCreateStock = yield* encodeCommand({
            contract: system.services.inventory.contracts.createStock,
            command: createStock,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [encodedCreateProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'inventory',
              commands: [encodedCreateStock],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const appRepo = yield* getServiceRepo({
            key: { generationId, serviceName: 'app' },
          });
          const inventoryRepo = yield* getServiceRepo({
            key: { generationId, serviceName: 'inventory' },
          });
          const appSnapshot = yield* makeAsync(() =>
            appRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'product', resourceId: productId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const inventorySnapshot = yield* makeAsync(() =>
            inventoryRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [{ modelName: 'stock', resourceId: stockId }],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const product = appSnapshot.resources[0];
          const stock = inventorySnapshot.resources[0];
          if (product?.status !== 'found' || stock?.status !== 'found') {
            return yield* Effect.die(
              new Error(
                'Expected canonical aggregate-frontend-route snapshots',
              ),
            );
          }

          const createUser = yield* system.aggregates.user.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: { id: userId, name: 'Frontend route user' },
          });
          const replicate = yield* system.aggregates.user.makeCommand({
            contractName: 'replicateProductAndStock',
            aggregateId,
            systemName: system.name,
            payload: { product: product.resource, stock: stock.resource },
          });
          const encodedCreateUser = yield* encodeCommand({
            contract: system.aggregates.user.contracts.createUser,
            command: createUser,
          });
          const encodedReplicate = yield* encodeCommand({
            contract: system.aggregates.user.contracts.replicateProductAndStock,
            command: replicate,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: main.aggregateName,
              commands: [encodedCreateUser, encodedReplicate],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const aggregateFrontendLock =
            makeFrontendControllerSpec(main).aggregateFrontendLock;
          const initialFrontendState = yield* getAggregateFrontendState({
            generationId,
            actorRef: {
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
            },
            frontendName: main.frontendName,
            aggregateFrontendLock,
          });
          expect(initialFrontendState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: productId }),
              expect.objectContaining({ id: stockId }),
            ]),
          );

          const updateProduct = yield* system.services.app.makeCommand({
            contractName: 'updateProduct',
            payload: { id: productId, name: 'Frontend route product updated' },
          });
          const updateStock = yield* system.services.inventory.makeCommand({
            contractName: 'updateStock',
            payload: { id: stockId, quantity: 11 },
          });
          const encodedUpdateProduct = yield* encodeCommand({
            contract: system.services.app.contracts.updateProduct,
            command: updateProduct,
          });
          const encodedUpdateStock = yield* encodeCommand({
            contract: system.services.inventory.contracts.updateStock,
            command: updateStock,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [encodedUpdateProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: 'inventory',
              commands: [encodedUpdateStock],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          yield* makeAsync(() => appRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() => inventoryRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          const appServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId, serviceName: 'app' },
          });
          const inventoryServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId, serviceName: 'inventory' },
          });
          yield* makeAsync(() =>
            appServiceBlockRepo.drainAggregateSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            inventoryServiceBlockRepo.drainAggregateSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const aggregateRepo = yield* getAggregateRepo({ key: aggregateKey });
          yield* makeAsync(() => aggregateRepo.drainAggregateOutboxes()).pipe(
            Effect.flatMap(decodeRpc),
          );
          const aggregateBlockRepo = yield* getAggregateBlockRepo({
            key: aggregateKey,
          });
          yield* makeAsync(() =>
            aggregateBlockRepo.drainAggregateFrontendOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
            key: aggregateFrontendKey,
          });
          yield* makeAsync(() =>
            aggregateFrontendRepo.drainAggregateFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const updatedFrontendState = yield* getAggregateFrontendState({
            generationId,
            actorRef: {
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
            },
            frontendName: main.frontendName,
            aggregateFrontendLock,
          });
          expect(updatedFrontendState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: productId,
                name: 'Frontend route product updated',
              }),
              expect.objectContaining({ id: stockId, quantity: 11 }),
            ]),
          );
          const frontendStateJson = JSON.stringify(updatedFrontendState);
          expect(frontendStateJson).not.toContain('serviceCursor');
          expect(frontendStateJson).not.toContain('serviceIndex');
          expect(frontendStateJson).not.toContain('serviceSubscriptions');
          expect(frontendStateJson).not.toContain('replicationMembership');

          const routeState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key: aggregateFrontendKey,
              fn: ({ db, schema }) => ({
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, productId))
                  .get(),
                stock: db
                  .select()
                  .from(schema.stock)
                  .where(eq(schema.stock.id, stockId))
                  .get(),
              }),
            }),
          );
          expect(routeState).toEqual({
            product: expect.objectContaining({
              id: productId,
              name: 'Frontend route product updated',
            }),
            stock: expect.objectContaining({ id: stockId, quantity: 11 }),
          });
        }),
      120_000,
    );

    it.effect(
      'applies an encoded service update and publishes one flat aggregate block',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_aggregate_static_service_update';
          const aggregateId = makeAggregateId({
            id: 'aggregate-static-service-update',
          });
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const aggregateRepo = yield* getAggregateRepo({ key: aggregateKey });
          const aggregateRepoName =
            yield* AggregateRepo.boundDORepoConfig.nameUtils.makeName(
              aggregateKey,
            );
          const serviceRepoName =
            yield* ServiceRepo.boundDORepoConfig.nameUtils.makeName({
              generationId,
              serviceName: 'app',
            });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const initialCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const updatedCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const mutation = yield* mainModels.product.update(
            mainModels.product.version,
            {
              resourceId: productId,
              attributes: { name: 'Updated canonical product' },
            },
          );
          const encodedMutation = yield* encodeAppliedMutation({
            mutation: {
              ...mutation,
              commandId: 'cmd_aggregate_static_service_update',
              mutationIndex: 0,
              appliedAt: new Date(1),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.product)
                  .values({
                    id: productId,
                    modelName: mainModels.product.modelName,
                    name: 'Original canonical product',
                    version: mainModels.product.version,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: null,
                  })
                  .run();
                db.insert(schema.serviceSubscriptions)
                  .values({
                    serviceRepoName,
                    serviceName: 'app',
                    currentServiceCursor: initialCursor,
                    currentServiceIndex: 0,
                    subscribedAt: now,
                    failure: null,
                  })
                  .run();
              },
            }),
          );

          yield* makeAsync(() =>
            aggregateRepo.handleServiceBlocks({
              serviceName: 'app',
              blocks: [
                {
                  writeIndex: 1,
                  executedCommands: [],
                  failedCommands: [],
                  appliedMutations: [encodedMutation],
                  lastServiceCursor: updatedCursor,
                  serviceIndex: 1,
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const aggregateState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: async ({ db, schema, state }) => ({
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, productId))
                  .get(),
                subscription: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .where(
                    eq(
                      schema.serviceSubscriptions.serviceRepoName,
                      serviceRepoName,
                    ),
                  )
                  .get(),
                outbox: db.select().from(schema.aggregateBlockOutbox).all(),
                alarm: await state.storage.getAlarm(),
              }),
            }),
          );
          expect(aggregateState.product).toEqual(
            expect.objectContaining({
              id: productId,
              name: 'Updated canonical product',
            }),
          );
          expect(aggregateState.subscription).toEqual(
            expect.objectContaining({
              currentServiceCursor: updatedCursor,
              currentServiceIndex: 1,
            }),
          );
          expect(aggregateState.outbox).toEqual([
            expect.objectContaining({
              aggregateIndex: 1,
              appliedMutations: expect.stringContaining(productId),
              publishedAt: expect.any(Date),
              failure: null,
            }),
          ]);
          expect(aggregateState.alarm).toBeNull();

          const aggregateBlockState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateBlockRepo,
              repo: AggregateBlockRepo,
              key: aggregateKey,
              fn: ({ db, schema }) =>
                db.select().from(schema.finalizedBlocks).all(),
            }),
          );
          expect(aggregateBlockState).toEqual([
            expect.objectContaining({
              aggregateIndex: 1,
              appliedMutations: expect.stringContaining(productId),
            }),
          ]);
          expect(aggregateRepoName).toMatch(/^acctrepo_/);
        }),
    );

    it.effect(
      'advances an irrelevant service block without creating an aggregate block',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_aggregate_static_irrelevant_service_block';
          const aggregateId = makeAggregateId({
            id: 'aggregate-static-irrelevant-service-block',
          });
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const aggregateRepo = yield* getAggregateRepo({ key: aggregateKey });
          const serviceRepoName =
            yield* ServiceRepo.boundDORepoConfig.nameUtils.makeName({
              generationId,
              serviceName: 'app',
            });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const initialCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const advancedCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const mutation = yield* mainModels.product.update(
            mainModels.product.version,
            {
              resourceId: productId,
              attributes: { name: 'Never replicated' },
            },
          );
          const encodedMutation = yield* encodeAppliedMutation({
            mutation: {
              ...mutation,
              commandId: 'cmd_aggregate_static_irrelevant_service_block',
              mutationIndex: 0,
              appliedAt: new Date(1),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => {
                db.insert(schema.serviceSubscriptions)
                  .values({
                    serviceRepoName,
                    serviceName: 'app',
                    currentServiceCursor: initialCursor,
                    currentServiceIndex: 0,
                    subscribedAt: new Date(0),
                    failure: null,
                  })
                  .run();
              },
            }),
          );

          const block = {
            writeIndex: 1,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [encodedMutation],
            lastServiceCursor: advancedCursor,
            serviceIndex: 1,
          };
          yield* makeAsync(() =>
            aggregateRepo.handleServiceBlocks({
              serviceName: 'app',
              blocks: [block, block],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const state = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: aggregateKey,
              fn: ({ db, schema }) => ({
                products: db.select().from(schema.product).all(),
                subscription: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .where(
                    eq(
                      schema.serviceSubscriptions.serviceRepoName,
                      serviceRepoName,
                    ),
                  )
                  .get(),
                outbox: db.select().from(schema.aggregateBlockOutbox).all(),
              }),
            }),
          );
          expect(state.products).toEqual([]);
          expect(state.subscription).toEqual(
            expect.objectContaining({
              currentServiceCursor: advancedCursor,
              currentServiceIndex: 1,
            }),
          );
          expect(state.outbox).toEqual([]);
        }),
    );
  });
});
