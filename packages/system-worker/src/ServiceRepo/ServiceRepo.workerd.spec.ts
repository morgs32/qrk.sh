/*
 * System-worker annotation:
 * Exercises the Service Repo.workerd.spec behavior through the local test/runtime harness.
 * The assertions document expected integration behavior; avoid broad rewrites while changing production code.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IServiceCommand } from '@zerospin/core/contracts/types';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AccountRepo } from '../AccountRepo/AccountRepo.js';
import { getAccountRepo } from '../AccountRepo/getAccountRepo/getAccountRepo.js';
import { userAccount } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { ServiceBlockSchema } from '../blockSchemas.js';
import { getServiceBlockRepo } from '../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../ServiceBlockRepo/ServiceBlockRepo.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { getServiceRepo } from './getServiceRepo/getServiceRepo.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
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
    it.effect('finalizes service commands into service-owned storage', () =>
      Effect.gen(function* () {
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: 'gen_test',
            serviceName: 'app',
          },
        });
        const command: IServiceCommand = {
          id: 'cmd_service_finalize',
          commandName: 'createProduct',
          payload: {
            id: 'prd_service_finalize',
            name: 'Service Finalized Product',
          },
          version: '1.0.0',
          systemVersion: '1.0.0',
          commandType: 'service',
          serviceName: 'app',
        };
        const secondCommand: IServiceCommand = {
          id: 'cmd_service_finalize_second',
          commandName: 'createProduct',
          payload: {
            id: 'prd_service_finalize_second',
            name: 'Second Service Finalized Product',
          },
          version: '1.0.0',
          systemVersion: '1.0.0',
          commandType: 'service',
          serviceName: 'app',
        };

        const result = yield* makeAsync(() =>
          serviceRepo.finalizeServiceCommands({
            serviceName: 'app',
            commands: [command, secondCommand],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const rows = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceRepo,
            repo: ServiceRepo,
            key: { generationId: 'gen_test', serviceName: 'app' },
            fn: ({ db, schema }) => {
              const productTable = schema.product;
              const serviceCursorsTable = schema.serviceCursors;
              return {
                products: db
                  .select({
                    id: productTable.id,
                    name: productTable.name,
                  })
                  .from(productTable)
                  .all(),
                serviceCursors: db
                  .select({
                    commandId: serviceCursorsTable.commandId,
                    serviceCursor: serviceCursorsTable.serviceCursor,
                  })
                  .from(serviceCursorsTable)
                  .all(),
              };
            },
          }),
        );

        expect(result.failedCommands).toEqual([]);
        expect(result.executedCommands).toHaveLength(2);
        expect(result.executedCommands[0]?.serviceCursor).toMatch(/^svcur_/);
        expect(rows.products).toEqual([
          {
            id: 'prd_service_finalize',
            name: 'Service Finalized Product',
          },
          {
            id: 'prd_service_finalize_second',
            name: 'Second Service Finalized Product',
          },
        ]);
        expect(rows.serviceCursors).toEqual([
          {
            commandId: 'cmd_service_finalize',
            serviceCursor: result.executedCommands[0]?.serviceCursor,
          },
          {
            commandId: 'cmd_service_finalize_second',
            serviceCursor: result.executedCommands[1]?.serviceCursor,
          },
        ]);

        const initialSnapshot = yield* makeAsync(() =>
          serviceRepo.getReplicatedResources({
            currentServiceIndex: null,
            resources: [
              {
                modelName: 'product',
                resourceId: 'prd_service_finalize',
              },
              {
                modelName: 'product',
                resourceId: 'prd_service_missing',
              },
              {
                modelName: 'product',
                resourceId: 'prd_service_finalize_second',
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(initialSnapshot.resources).toEqual([
          {
            status: 'found',
            modelName: 'product',
            resourceId: 'prd_service_finalize',
            resource: expect.objectContaining({
              id: 'prd_service_finalize',
              name: 'Service Finalized Product',
            }),
          },
          {
            status: 'missing',
            modelName: 'product',
            resourceId: 'prd_service_missing',
            failure: expect.objectContaining({
              code: 'replicated-service-resource-not-found',
            }),
          },
          {
            status: 'found',
            modelName: 'product',
            resourceId: 'prd_service_finalize_second',
            resource: expect.objectContaining({
              id: 'prd_service_finalize_second',
              name: 'Second Service Finalized Product',
            }),
          },
        ]);
        expect(initialSnapshot.serviceBlocks).toEqual([]);
        expect(initialSnapshot.lastServiceCursor).toBe(
          result.executedCommands[1]?.serviceCursor,
        );
        expect(initialSnapshot.serviceIndex).toBe(2);

        const updateCommand: IServiceCommand = {
          id: 'cmd_service_snapshot_update',
          commandName: 'updateProduct',
          payload: {
            id: 'prd_service_finalize',
            name: 'Service Snapshot Updated Product',
          },
          version: '1.0.0',
          systemVersion: '1.0.0',
          commandType: 'service',
          serviceName: 'app',
        };
        const [concurrentUpdateEncoded, concurrentSnapshotEncoded] =
          yield* Effect.promise(() =>
            Promise.all([
              serviceRepo.finalizeServiceCommands({
                serviceName: 'app',
                commands: [updateCommand],
              }),
              serviceRepo.getReplicatedResources({
                currentServiceIndex: 2,
                resources: [
                  {
                    modelName: 'product',
                    resourceId: 'prd_service_finalize',
                  },
                  {
                    modelName: 'product',
                    resourceId: 'prd_service_finalize_second',
                  },
                ],
              }),
            ]),
          );
        const concurrentUpdate = yield* decodeRpc(concurrentUpdateEncoded);
        const concurrentSnapshot = yield* decodeRpc(concurrentSnapshotEncoded);
        expect(concurrentUpdate.failedCommands).toEqual([]);
        const concurrentFirstResource = concurrentSnapshot.resources[0];
        expect(concurrentFirstResource?.status).toBe('found');
        if (
          concurrentSnapshot.serviceIndex === 2 &&
          concurrentFirstResource?.status === 'found'
        ) {
          expect(concurrentFirstResource.resource.name).toBe(
            'Service Finalized Product',
          );
          expect(concurrentSnapshot.lastServiceCursor).toBe(
            result.executedCommands[1]?.serviceCursor,
          );
          expect(concurrentSnapshot.serviceBlocks).toEqual([]);
        } else {
          expect(concurrentSnapshot.serviceIndex).toBe(3);
          if (concurrentFirstResource?.status !== 'found') {
            throw new Error('Expected the grouped product snapshot to be found');
          }
          expect(concurrentFirstResource.resource.name).toBe(
            'Service Snapshot Updated Product',
          );
          expect(concurrentSnapshot.lastServiceCursor).toBe(
            concurrentUpdate.executedCommands[0]?.serviceCursor,
          );
          expect(concurrentSnapshot.serviceBlocks).toHaveLength(1);
          expect(concurrentSnapshot.serviceBlocks[0]).toEqual(
            expect.objectContaining({
              executedCommands: [
                expect.objectContaining({
                  id: 'cmd_service_snapshot_update',
                  commandName: 'updateProduct',
                  status: 'executed',
                }),
              ],
              failedCommands: [],
              serviceIndex: 3,
            }),
          );
        }

        const retainedSuffix = yield* makeAsync(() =>
          serviceRepo.getReplicatedResources({
            currentServiceIndex: 2,
            resources: [
              {
                modelName: 'product',
                resourceId: 'prd_service_finalize',
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(retainedSuffix.serviceIndex).toBe(3);
        expect(retainedSuffix.lastServiceCursor).toBe(
          concurrentUpdate.executedCommands[0]?.serviceCursor,
        );
        expect(retainedSuffix.serviceBlocks).toHaveLength(1);
        expect(retainedSuffix.serviceBlocks[0]).toEqual(
          expect.objectContaining({
            executedCommands: [
              expect.objectContaining({
                id: 'cmd_service_snapshot_update',
                commandName: 'updateProduct',
                status: 'executed',
              }),
            ],
            failedCommands: [],
            serviceIndex: 3,
          }),
        );

        const queryResult = yield* makeAsync(() =>
          serviceRepo.executeServiceQuery({
            serviceName: 'app',
            queryName: 'getProducts',
            params: {},
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(queryResult).toEqual([
          {
            id: 'prd_service_finalize',
            name: 'Service Snapshot Updated Product',
          },
          {
            id: 'prd_service_finalize_second',
            name: 'Second Service Finalized Product',
          },
        ]);
      }),
    );

    it.effect('returns failed commands for unknown services', () =>
      Effect.gen(function* () {
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: 'gen_test',
            serviceName: 'missing',
          },
        });
        const command: IServiceCommand = {
          id: 'cmd_missing_service',
          commandName: 'createProduct',
          payload: {
            id: 'prd_missing_service',
            name: 'Missing Service Product',
          },
          version: '1.0.0',
          systemVersion: '1.0.0',
          commandType: 'service',
          serviceName: 'missing',
        };

        const result = yield* makeAsync(() =>
          serviceRepo.finalizeServiceCommands({
            serviceName: 'missing',
            commands: [command],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(result.executedCommands).toEqual([]);
        expect(result.failedCommands).toHaveLength(1);
        expect(result.failedCommands[0]?.id).toBe('cmd_missing_service');
        expect(result.failedCommands[0]?.failure).toContain(
          'service-not-found',
        );
      }),
    );

    it.effect(
      'retries the persisted account repo name and resumes delivery after the retry becomes due',
      () =>
        Effect.gen(function* () {
          const serviceKey = {
            generationId: 'gen_test',
            serviceName: 'app',
          };
          const accountKey = {
            generationId: 'gen_test',
            accountId: 'acct_service_delivery_retry',
            accountName: userAccount.name,
          };
          const accountRepoName =
            yield* AccountRepo.repoUtils.nameUtils.makeName(accountKey);
          const serviceRepoName =
            yield* ServiceRepo.repoUtils.nameUtils.makeName(serviceKey);
          const serviceRepo = yield* getServiceRepo({ key: serviceKey });
          const command: IServiceCommand = {
            id: 'cmd_service_delivery_retry',
            commandName: 'createProduct',
            payload: {
              id: 'prd_service_delivery_retry',
              name: 'Service Delivery Retry Product',
            },
            version: '1.0.0',
            systemVersion: '1.0.0',
            commandType: 'service',
            serviceName: 'app',
          };

          const result = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [command],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const executedCommand = result.executedCommands[0];
          if (executedCommand === undefined) {
            return yield* Effect.die(
              new Error('Expected the service retry command to execute'),
            );
          }
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: serviceKey,
          });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) => {
                db.insert(schema.accountSubscribers)
                  .values({
                    accountRepoName,
                    accountId: accountKey.accountId,
                    accountName: accountKey.accountName,
                    currentServiceCursor: executedCommand.serviceCursor,
                    currentServiceIndex: 0,
                    deliveryAttempts: 0,
                    nextRetryAt: null,
                    lastDeliveryError: null,
                  })
                  .run();
              },
            }),
          );

          yield* makeAsync(() =>
            serviceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const failedDelivery = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: async ({ db, schema, storage }) => ({
                subscriber: db
                  .select()
                  .from(schema.accountSubscribers)
                  .where(
                    eq(
                      schema.accountSubscribers.accountRepoName,
                      accountRepoName,
                    ),
                  )
                  .get(),
                alarm: await storage.getAlarm(),
              }),
            }),
          );
          expect(failedDelivery.subscriber).toEqual(
            expect.objectContaining({
              accountRepoName,
              deliveryAttempts: 1,
              nextRetryAt: expect.any(Number),
              lastDeliveryError: expect.stringContaining(
                'not subscribed to service',
              ),
            }),
          );
          expect(failedDelivery.alarm).toBe(
            failedDelivery.subscriber?.nextRetryAt,
          );

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: accountKey,
              fn: ({ db, schema }) => {
                db.insert(schema.serviceSubscriptions)
                  .values({
                    serviceRepoName,
                    serviceName: serviceKey.serviceName,
                    currentServiceCursor: executedCommand.serviceCursor,
                    currentServiceIndex: 0,
                    subscribedAt: new Date(),
                    failure: null,
                  })
                  .run();
              },
            }),
          );
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: ({ db, schema }) => {
                db.update(schema.accountSubscribers)
                  .set({ nextRetryAt: 0 })
                  .where(
                    eq(
                      schema.accountSubscribers.accountRepoName,
                      accountRepoName,
                    ),
                  )
                  .run();
              },
            }),
          );

          yield* makeAsync(() =>
            serviceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const resumedDelivery = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: serviceKey,
              fn: async ({ db, schema, storage }) => ({
                subscriber: db
                  .select()
                  .from(schema.accountSubscribers)
                  .where(
                    eq(
                      schema.accountSubscribers.accountRepoName,
                      accountRepoName,
                    ),
                  )
                  .get(),
                alarm: await storage.getAlarm(),
              }),
            }),
          );
          expect(resumedDelivery.subscriber).toEqual(
            expect.objectContaining({
              accountRepoName,
              currentServiceCursor: executedCommand.serviceCursor,
              currentServiceIndex: executedCommand.serviceIndex,
              deliveryAttempts: 0,
              nextRetryAt: null,
              lastDeliveryError: null,
            }),
          );
          expect(resumedDelivery.alarm).toBeNull();

          const accountSubscription = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: accountKey,
              fn: ({ db, schema }) =>
                db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .where(
                    eq(
                      schema.serviceSubscriptions.serviceRepoName,
                      serviceRepoName,
                    ),
                  )
                  .get(),
            }),
          );
          expect(accountSubscription).toEqual(
            expect.objectContaining({
              serviceRepoName,
              serviceName: serviceKey.serviceName,
              currentServiceCursor: executedCommand.serviceCursor,
              currentServiceIndex: executedCommand.serviceIndex,
            }),
          );
        }),
    );

    it.effect('fails unknown service queries', () =>
      Effect.gen(function* () {
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: 'gen_test',
            serviceName: 'app',
          },
        });

        const maybeResult = yield* makeAsync(() =>
          serviceRepo.executeServiceQuery({
            serviceName: 'app',
            queryName: 'missing',
            params: {},
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);

        expect(maybeResult._tag).toBe('Left');
        if (maybeResult._tag === 'Left') {
          expect(maybeResult.left.code).toBe('service-query-not-found');
        }
      }),
    );

    it.effect(
      'replays exact service blocks with idempotent receipts and bounded reads',
      () =>
        Effect.gen(function* () {
          const prevGenerationId = 'gen_service_replay_source';
          const targetGenerationId = 'gen_service_replay_target';
          const sourceServiceRepo = yield* getServiceRepo({
            key: { generationId: prevGenerationId, serviceName: 'app' },
          });
          const sourceResult = yield* makeAsync(() =>
            sourceServiceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                {
                  id: 'cmd_service_replay',
                  commandName: 'createProduct',
                  payload: {
                    id: 'prd_service_replay',
                    name: 'Replayed product',
                  },
                  version: '1.0.0',
                  commandType: 'service',
                  serviceName: 'app',
                  systemVersion: '1.0.0',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceResult.executedCommands).toHaveLength(1);
          yield* makeAsync(() =>
            sourceServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const sourceServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: prevGenerationId, serviceName: 'app' },
          });
          const sourceBound = yield* makeAsync(() =>
            sourceServiceBlockRepo.getReplayBound(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceBound.lastServiceCursor).not.toBeNull();
          expect(sourceBound.serviceIndex).not.toBeNull();
          if (sourceBound.serviceIndex === null) {
            return;
          }
          const sourceBlock = yield* makeAsync(() =>
            sourceServiceBlockRepo.getReplayBlock({
              afterServiceIndex: null,
              throughServiceIndex: sourceBound.serviceIndex,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceBlock).not.toBeNull();
          if (sourceBlock === null) {
            return;
          }

          const targetServiceRepo = yield* getServiceRepo({
            key: { generationId: targetGenerationId, serviceName: 'app' },
          });
          const firstReplay = yield* makeAsync(() =>
            targetServiceRepo.replayServiceBlock({
              deployId: 'dpl_service_replay',
              prevGenerationId,
              block: sourceBlock,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const secondReplay = yield* makeAsync(() =>
            targetServiceRepo.replayServiceBlock({
              deployId: 'dpl_service_replay',
              prevGenerationId,
              block: sourceBlock,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(firstReplay).toEqual({
            replayed: true,
            lastServiceCursor: sourceBlock.lastServiceCursor,
            serviceIndex: sourceBlock.serviceIndex,
            appliedMutationCount: sourceBlock.appliedMutations.length,
            discardedMutationCount: 0,
          });
          expect(secondReplay).toEqual({
            ...firstReplay,
            replayed: false,
          });

          const targetState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: {
                generationId: targetGenerationId,
                serviceName: 'app',
              },
              fn: ({ db, schema }) => ({
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, 'prd_service_replay'))
                  .get(),
                receipts: db
                  .select()
                  .from(schema.serviceReplayReceipts)
                  .all(),
              }),
            }),
          );
          expect(targetState.product).toEqual(
            expect.objectContaining({
              id: 'prd_service_replay',
              name: 'Replayed product',
            }),
          );
          expect(targetState.receipts).toHaveLength(1);

          const targetServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: targetGenerationId, serviceName: 'app' },
          });
          const targetBlock = yield* makeAsync(() =>
            targetServiceBlockRepo.getReplayBlock({
              afterServiceIndex: sourceBlock.serviceIndex - 1,
              throughServiceIndex: sourceBlock.serviceIndex,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(targetBlock).toEqual(
            expect.objectContaining({
              lastServiceCursor: sourceBlock.lastServiceCursor,
              serviceIndex: sourceBlock.serviceIndex,
              executedCommands: sourceBlock.executedCommands,
              failedCommands: sourceBlock.failedCommands,
            }),
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'inspects local pending service work without running it and drains it when hosted',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_service_drain_modes';
          const lastServiceCursor = 'svcur_service_drain_modes';
          const block = {
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
              fn: async ({ db, schema, storage }) => {
                db.insert(schema.serviceBlockOutbox)
                  .values({
                    lastServiceCursor,
                    serviceIndex: 1,
                    block: encodedBlock,
                    publishedAt: null,
                    failure: null,
                  })
                  .run();

                const localResult = await managedRuntime.runPromise(
                  drainGeneration({
                    db,
                    local: true,
                    generationId,
                    serviceName: 'app',
                    storage,
                  }).pipe(Effect.provide(AsyncLive), Effect.either),
                );
                const afterLocal = db
                  .select()
                  .from(schema.serviceBlockOutbox)
                  .get();
                const hostedResult = await managedRuntime.runPromise(
                  drainGeneration({
                    db,
                    local: false,
                    generationId,
                    serviceName: 'app',
                    storage,
                  }).pipe(Effect.provide(AsyncLive)),
                );
                const afterHosted = db
                  .select()
                  .from(schema.serviceBlockOutbox)
                  .get();
                return { localResult, afterLocal, hostedResult, afterHosted };
              },
            }),
          );

          expect(state.localResult._tag).toBe('Left');
          if (state.localResult._tag === 'Left') {
            expect(state.localResult.left.code).toBe(
              'service-generation-local-drain-required',
            );
          }
          expect(state.afterLocal?.publishedAt).toBeNull();
          expect(state.hostedResult).toEqual({ pendingServiceBlockCount: 0 });
          expect(state.afterHosted?.publishedAt).toEqual(expect.any(Date));
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
