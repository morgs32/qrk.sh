/*
 * ServiceRepo durable integration coverage below authored Dynamic execution:
 *
 * 1. Read one coherent resource snapshot and retained block suffix.
 * 2. Retry a persisted AggregateRepo subscriber and resume at its exact cursor.
 * 3. Drain pending generation publication before reporting terminal state.
 *
 * Shopping workerd coverage owns service contracts, replay adapters, and
 * command encoding through the statically bundled System.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedFailedServiceCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AggregateRepo } from '../AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from '../AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { ServiceBlockSchema } from '../blockSchemas.js';
import { mainModels } from '../fixtures/system.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { managedRuntime } from '../managedRuntime.js';
import { getServiceBlockRepo } from '../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../ServiceBlockRepo/ServiceBlockRepo.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getServiceRepo } from './getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from './ServiceRepo.js';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('ServiceRepo'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('ServiceRepo', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'retains terminal outcomes across overlap, conflict, and missing services',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_service_command_outcomes';
          const serviceKey = { generationId, serviceName: 'app' };
          const serviceRepo = yield* getServiceRepo({ key: serviceKey });
          const firstProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const secondProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const unseenConflictProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const firstCommand = yield* Schema.validate(
            EncodedServiceCommandSchema,
          )({
            id: 'cmd_service_outcome_first',
            commandName: 'createProduct',
            payload: JSON.stringify({
              id: firstProductId,
              name: 'First product',
            }),
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          });
          const failedCommand = yield* Schema.validate(
            EncodedServiceCommandSchema,
          )({
            id: 'cmd_service_outcome_failed',
            commandName: 'missingContract',
            payload: '{}',
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          });
          const secondCommand = yield* Schema.validate(
            EncodedServiceCommandSchema,
          )({
            id: 'cmd_service_outcome_second',
            commandName: 'createProduct',
            payload: JSON.stringify({
              id: secondProductId,
              name: 'Second product',
            }),
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          });

          const first = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              writeIndex: 10,
              serviceName: 'app',
              commands: [firstCommand, failedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(first.executedCommands.map(command => command.id)).toEqual([
            firstCommand.id,
          ]);
          expect(first.failedCommands.map(command => command.id)).toEqual([
            failedCommand.id,
          ]);

          const mixed = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              writeIndex: 11,
              serviceName: 'app',
              commands: [failedCommand, secondCommand, firstCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(mixed.executedCommands.map(command => command.id)).toEqual([
            secondCommand.id,
            firstCommand.id,
          ]);
          expect(mixed.failedCommands.map(command => command.id)).toEqual([
            failedCommand.id,
          ]);

          yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              writeIndex: 12,
              serviceName: 'app',
              commands: [firstCommand, failedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const unseenConflictCommand = yield* Schema.validate(
            EncodedServiceCommandSchema,
          )({
            id: 'cmd_service_outcome_conflict_unseen',
            commandName: 'createProduct',
            payload: JSON.stringify({
              id: unseenConflictProductId,
              name: 'Must not execute',
            }),
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          });
          const conflict = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              writeIndex: 13,
              serviceName: 'app',
              commands: [
                { ...firstCommand, payload: JSON.stringify({ bad: true }) },
                unseenConflictCommand,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(conflict).toMatchObject({
            _tag: 'Left',
            left: { code: 'service-command-outcome-conflict' },
          });

          const retainedState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: serviceKey,
              fn: ({ db, schema }) => ({
                outcomes: db.select().from(schema.serviceCommandOutcomes).all(),
                blocks: db.select().from(schema.serviceBlockOutbox).all(),
                conflictResource: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, unseenConflictProductId))
                  .get(),
              }),
            }),
          );
          expect(retainedState.outcomes).toHaveLength(3);
          expect(retainedState.blocks).toHaveLength(2);
          expect(retainedState.conflictResource).toBeUndefined();

          const missingServiceRepo = yield* getServiceRepo({
            key: {
              generationId,
              serviceName: 'missing-service',
            },
          });
          const missingServiceCommand = yield* Schema.validate(
            EncodedServiceCommandSchema,
          )({
            id: 'cmd_service_outcome_missing_service',
            commandName: 'anything',
            payload: '{}',
            contractVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'missing-service',
          });
          const missingService = yield* makeAsync(() =>
            missingServiceRepo.finalizeServiceCommands({
              writeIndex: 14,
              serviceName: 'missing-service',
              commands: [missingServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(missingService.executedCommands).toEqual([]);
          expect(missingService.failedCommands).toEqual([
            expect.objectContaining({
              id: missingServiceCommand.id,
              failure: expect.stringContaining('service-not-found'),
            }),
          ]);
          const missingState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: { generationId, serviceName: 'missing-service' },
              fn: ({ db, schema }) => ({
                outcomes: db.select().from(schema.serviceCommandOutcomes).all(),
                blocks: db.select().from(schema.serviceBlockOutbox).all(),
              }),
            }),
          );
          expect(missingState.outcomes).toHaveLength(1);
          expect(missingState.blocks).toHaveLength(1);
        }),
    );

    it.effect(
      'returns a coherent resource snapshot and retained service-block suffix',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_service_static_snapshot';
          const serviceKey = { generationId, serviceName: 'app' };
          const serviceRepo = yield* getServiceRepo({ key: serviceKey });
          const productId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const deletedProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const missingProductId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.product.abbreviation,
          });
          const firstCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const secondCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const thirdCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const createdAt = new Date(0);
          const deletedAt = new Date(1);
          const blockAtCurrentWatermark = {
            writeIndex: 1,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
            lastServiceCursor: firstCursor,
            serviceIndex: 1,
          };
          const firstRetainedBlock = {
            writeIndex: 2,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
            lastServiceCursor: secondCursor,
            serviceIndex: 2,
          };
          const secondRetainedBlock = {
            writeIndex: 3,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
            lastServiceCursor: thirdCursor,
            serviceIndex: 3,
          };
          const encodedBlockAtCurrentWatermark = yield* Schema.encode(
            Schema.parseJson(ServiceBlockSchema),
          )(blockAtCurrentWatermark);
          const encodedFirstRetainedBlock = yield* Schema.encode(
            Schema.parseJson(ServiceBlockSchema),
          )(firstRetainedBlock);
          const encodedSecondRetainedBlock = yield* Schema.encode(
            Schema.parseJson(ServiceBlockSchema),
          )(secondRetainedBlock);
          const outcomeRows = [];
          for (const { index, serviceCursor, appliedAt } of [
            { index: 1, serviceCursor: firstCursor, appliedAt: createdAt },
            { index: 2, serviceCursor: secondCursor, appliedAt: deletedAt },
            { index: 3, serviceCursor: thirdCursor, appliedAt: deletedAt },
          ]) {
            const terminalCommand = yield* Schema.validate(
              EncodedFailedServiceCommandSchema,
            )({
              id:
                index === 1
                  ? 'cmd_service_static_snapshot_1'
                  : index === 2
                    ? 'cmd_service_static_snapshot_2'
                    : 'cmd_service_static_snapshot_3',
              commandName: 'missingContract',
              payload: '{}',
              contractVersion: '1.0.0',
              commandType: 'service',
              serviceName: 'app',
              serviceCursor,
              serviceIndex: index,
              failedAt: appliedAt,
              failure: 'retained test failure',
              status: 'failed',
            });
            outcomeRows.push({
              commandId: terminalCommand.id,
              commandBytes: yield* Schema.encode(
                Schema.parseJson(EncodedServiceCommandSchema),
              )(terminalCommand),
              command: yield* Schema.encode(
                Schema.parseJson(EncodedFailedServiceCommandSchema),
              )(terminalCommand),
              serviceCursor,
              serviceIndex: index,
              appliedMutations: '[]',
              writeIndex: index,
            });
          }

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: serviceKey,
              fn: ({ db, schema }) => {
                db.insert(schema.product)
                  .values([
                    {
                      id: productId,
                      modelName: mainModels.product.modelName,
                      name: 'Canonical product',
                      version: mainModels.product.version,
                      createdAt,
                      updatedAt: createdAt,
                      deletedAt: null,
                    },
                    {
                      id: deletedProductId,
                      modelName: mainModels.product.modelName,
                      name: 'Deleted canonical product',
                      version: mainModels.product.version,
                      createdAt,
                      updatedAt: deletedAt,
                      deletedAt,
                    },
                  ])
                  .run();
                db.insert(schema.serviceCommandOutcomes)
                  .values(outcomeRows)
                  .run();
                db.insert(schema.serviceBlockOutbox)
                  .values([
                    {
                      lastServiceCursor: firstCursor,
                      serviceIndex: 1,
                      block: encodedBlockAtCurrentWatermark,
                      publishedAt: deletedAt,
                      failure: null,
                    },
                    {
                      lastServiceCursor: secondCursor,
                      serviceIndex: 2,
                      block: encodedFirstRetainedBlock,
                      publishedAt: deletedAt,
                      failure: null,
                    },
                    {
                      lastServiceCursor: thirdCursor,
                      serviceIndex: 3,
                      block: encodedSecondRetainedBlock,
                      publishedAt: deletedAt,
                      failure: null,
                    },
                  ])
                  .run();
              },
            }),
          );

          const snapshot = yield* makeAsync(() =>
            serviceRepo.getReplicatedResources({
              currentServiceIndex: 1,
              resources: [
                { modelName: 'product', resourceId: productId },
                { modelName: 'product', resourceId: missingProductId },
                { modelName: 'product', resourceId: deletedProductId },
                { modelName: 'product', resourceId: productId },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(snapshot.lastServiceCursor).toBe(thirdCursor);
          expect(snapshot.serviceIndex).toBe(3);
          expect(snapshot.serviceBlocks).toEqual([
            firstRetainedBlock,
            secondRetainedBlock,
          ]);
          expect(snapshot.resources).toEqual([
            expect.objectContaining({
              status: 'found',
              modelName: mainModels.product.modelName,
              resourceId: productId,
              resource: expect.objectContaining({
                id: productId,
                name: 'Canonical product',
              }),
            }),
            expect.objectContaining({
              status: 'missing',
              modelName: mainModels.product.modelName,
              resourceId: missingProductId,
              failure: expect.objectContaining({
                code: 'replicated-service-resource-not-found',
              }),
            }),
            expect.objectContaining({
              status: 'missing',
              modelName: mainModels.product.modelName,
              resourceId: deletedProductId,
              failure: expect.objectContaining({
                code: 'service-resource-deleted',
              }),
            }),
            expect.objectContaining({
              status: 'found',
              modelName: mainModels.product.modelName,
              resourceId: productId,
            }),
          ]);

          const firstSubscriptionSnapshot = yield* makeAsync(() =>
            serviceRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [
                { modelName: 'product', resourceId: productId },
                { modelName: 'product', resourceId: productId },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(firstSubscriptionSnapshot).toEqual({
            lastServiceCursor: thirdCursor,
            serviceIndex: 3,
            serviceBlocks: [],
            resources: [snapshot.resources[0], snapshot.resources[3]],
          });
        }),
    );

    it.effect(
      'retries one persisted aggregate subscriber and resumes at its exact cursor',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_service_static_delivery_retry';
          const serviceKey = { generationId, serviceName: 'app' };
          const aggregateKey = {
            generationId,
            aggregateId: makeAggregateId({
              id: 'service-static-delivery-retry',
            }),
            aggregateName: 'user',
          };
          const aggregateRepoName =
            yield* AggregateRepo.boundDORepoConfig.nameUtils.makeName(
              aggregateKey,
            );
          const serviceRepoName =
            yield* ServiceRepo.boundDORepoConfig.nameUtils.makeName(serviceKey);
          const initialCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const blockCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const block = {
            writeIndex: 1,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
            lastServiceCursor: blockCursor,
            serviceIndex: 1,
          };
          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: serviceKey,
          });
          yield* makeAsync(() => serviceBlockRepo.publish(block)).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) => {
                db.insert(schema.aggregateSubscribers)
                  .values({
                    aggregateRepoName,
                    aggregateId: aggregateKey.aggregateId,
                    aggregateName: aggregateKey.aggregateName,
                    currentServiceCursor: initialCursor,
                    currentServiceIndex: 0,
                    lastDeliveryError: null,
                  })
                  .run();
              },
            }),
          );

          yield* makeAsync(() =>
            serviceBlockRepo.drainAggregateSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const failedDelivery = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: async ({ db, schema, state }) => ({
                subscriber: db
                  .select()
                  .from(schema.aggregateSubscribers)
                  .where(
                    eq(
                      schema.aggregateSubscribers.aggregateRepoName,
                      aggregateRepoName,
                    ),
                  )
                  .get(),
                alarm: await state.storage.getAlarm(),
              }),
            }),
          );
          expect(failedDelivery.subscriber).toEqual(
            expect.objectContaining({
              lastDeliveryError: expect.stringContaining(
                'not subscribed to service',
              ),
            }),
          );
          expect(failedDelivery.alarm).toEqual(expect.any(Number));

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
                    serviceName: serviceKey.serviceName,
                    currentServiceCursor: initialCursor,
                    currentServiceIndex: 0,
                    subscribedAt: new Date(0),
                    failure: null,
                  })
                  .run();
              },
            }),
          );
          yield* makeAsync(() =>
            serviceBlockRepo.drainAggregateSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const resumedDelivery = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: async ({ db, schema, state }) => ({
                subscriber: db
                  .select()
                  .from(schema.aggregateSubscribers)
                  .where(
                    eq(
                      schema.aggregateSubscribers.aggregateRepoName,
                      aggregateRepoName,
                    ),
                  )
                  .get(),
                alarm: await state.storage.getAlarm(),
              }),
            }),
          );
          expect(resumedDelivery.subscriber).toEqual(
            expect.objectContaining({
              currentServiceCursor: blockCursor,
              currentServiceIndex: 1,
              lastDeliveryError: null,
            }),
          );
          expect(resumedDelivery.alarm).toBeNull();
        }),
    );

    it.effect(
      'drains pending service work before reporting terminal state',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_service_static_drain_modes';
          const lastServiceCursor = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          const block = {
            writeIndex: 1,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
            lastServiceCursor,
            serviceIndex: 1,
          };
          const encodedBlock = yield* Schema.encode(
            Schema.parseJson(ServiceBlockSchema),
          )(block);

          const state = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: { generationId, serviceName: 'app' },
              fn: async ({ db, schema, state }) => {
                db.insert(schema.serviceBlockOutbox)
                  .values({
                    lastServiceCursor,
                    serviceIndex: 1,
                    block: encodedBlock,
                    publishedAt: null,
                    failure: null,
                  })
                  .run();

                const result = await managedRuntime.runPromise(
                  drainGeneration({
                    db,
                    deliveryQueue: makeDeliveryQueue({
                      storage: state.storage,
                    }),
                    generationId,
                    serviceName: 'app',
                    storage: state.storage,
                  }).pipe(Effect.provide(AsyncLive)),
                );
                const afterDrain = db
                  .select()
                  .from(schema.serviceBlockOutbox)
                  .get();
                return {
                  result,
                  afterDrain,
                };
              },
            }),
          );

          expect(state.result).toEqual({ pendingServiceBlockCount: 0 });
          expect(state.afterDrain?.publishedAt).toEqual(expect.any(Date));
        }),
    );
  });
});
