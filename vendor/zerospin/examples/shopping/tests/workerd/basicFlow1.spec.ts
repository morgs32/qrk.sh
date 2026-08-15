import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeTestGateway } from '@zerospin/dev-worker/makeTestGateway';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { exports as workerExports } from 'cloudflare:workers';
import { Effect } from 'effect';
import type { SystemWorker } from 'system-worker';
import { AggregateBlockRepo } from 'system-worker/AggregateBlockRepo/AggregateBlockRepo';
import { getAggregateBlockRepo } from 'system-worker/AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo';
import { getAggregateFrontendRepo } from 'system-worker/AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo';
import { AggregateRepo } from 'system-worker/AggregateRepo/AggregateRepo';
import { getAggregateRepo } from 'system-worker/AggregateRepo/getAggregateRepo/getAggregateRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect } from 'vitest';

import { authenticationSignature } from '@/zerospin/authentication';
import { shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';
import { system } from '@/zerospin/system';

const appService = system.services.app;
const shopperAggregate = system.aggregates.shopper;
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(shopperFrontend).aggregateFrontendLock;

/**
 * basicFlow1 — service seeds finalize, aggregate frontend state bootstraps,
 * and later aggregate changes publish through AggregateBlockRepo directly to
 * AggregateFrontendRepo.
 */

const E2E_AGGREGATE_ID = makeAggregateId({ id: '1' });
const E2E_CLERK_USER_ID_1 = 'user_e2e_1';
const E2E_USER_ID_1 = E2E_CLERK_USER_ID_1;

const systemWorker = workerExports.SystemWorker as unknown as SystemWorker;

const TestLayer = makeWorkerdE2eTestLayer('basicFlow1');

describe('basicFlow1: current shopping system workerd flow', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'finalizes service products, bootstraps shopper state, and publishes frontend sync',
      () =>
        /*
         * 1. Build three app service product commands.
         * 2. Finalize products into ServiceRepo.
         * 3. Assert aggregate and direct service queries see those product rows.
         * 4. Build and finalize the aggregate createUser command.
         * 5. Authenticate the shopper, then authorize the exact aggregate frontend lock.
         * 6. Rebuild frontend state from archived aggregate blocks.
         * 7. Build and finalize an aggregate updateUser command after bootstrap.
         * 8. Drain aggregate block fanout and the frontend block outbox.
         * 9. Assert AggregateFrontendRepo advanced.
         * 10. Assert frontend state carries the user change.
         */
        Effect.gen(function* () {
          const { gatewayApi, generationId } = yield* Effect.acquireRelease(
            makeAsync(makeTestGateway),
            opened => Effect.sync(() => opened.gatewayApi[Symbol.dispose]()),
          );
          const systemApi = yield* makeAsync(() =>
            gatewayApi.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );

          // 1 — current shopping product catalog is service-owned.
          const createProductA = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'E2E Product A',
              description: 'service seed A',
              price: 10,
            },
          });
          const createProductB = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'E2E Product B',
              description: 'service seed B',
              price: 20,
            },
          });
          const createProductC = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'E2E Product C',
              description: 'service seed C',
              price: 30,
            },
          });
          const encodedProductCommands = yield* Effect.forEach(
            [createProductA, createProductB, createProductC],
            command =>
              appService.contracts.createProduct
                .encodePayload({ payload: command.payload })
                .pipe(Effect.map(payload => ({ ...command, payload }))),
          );

          // 2 — product seeds finalize through ServiceRepo, not AggregateRepo.
          const serviceFinalization = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: encodedProductCommands,
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          expect(serviceFinalization.failed).toEqual([]);
          expect(serviceFinalization.executed).toHaveLength(3);
          expect(serviceFinalization.executed[0]?.id).toBe(createProductA.id);
          expect(serviceFinalization.executed[1]?.id).toBe(createProductB.id);
          expect(serviceFinalization.executed[2]?.id).toBe(createProductC.id);

          // 3 — the shopper actor API reads the service-owned product table.
          const productRows = yield* makeAsync(() =>
            systemWorker.executeAggregateQuery({
              actorRef: {
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
                userId: E2E_USER_ID_1,
              },
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
              generationId,
              queryName: 'getProducts',
              params: {},
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(productRows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: createProductA.payload.id,
                name: 'E2E Product A',
              }),
              expect.objectContaining({
                id: createProductB.payload.id,
                name: 'E2E Product B',
              }),
              expect.objectContaining({
                id: createProductC.payload.id,
                name: 'E2E Product C',
              }),
            ]),
          );

          const directServiceProductRows = yield* makeAsync(() =>
            systemWorker.executeServiceQuery({
              generationId,
              serviceName: appService.name,
              queryName: 'getProducts',
              params: {},
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(directServiceProductRows).toEqual(productRows);

          const missingServiceQuery = yield* makeAsync(() =>
            systemWorker.executeServiceQuery({
              generationId,
              serviceName: appService.name,
              queryName: 'missing',
              params: {},
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(missingServiceQuery._tag).toBe('Left');
          if (missingServiceQuery._tag === 'Left') {
            expect(missingServiceQuery.left.code).toBe(
              'service-query-not-found',
            );
          }

          // 4 — shopper identity is aggregate-owned and selected by userId.
          const userId = User.prefixId(E2E_CLERK_USER_ID_1);
          const createUserCommand = yield* shopperAggregate.makeCommand({
            contractName: 'createUser',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: userId,
              clerkUserId: E2E_CLERK_USER_ID_1,
            },
          });
          const encodedCreateUserCommand = {
            ...createUserCommand,
            payload: yield* shopperAggregate.contracts.createUser.encodePayload(
              { payload: createUserCommand.payload },
            ),
          };

          const createUserBlock = yield* makeAsync(() =>
            systemApi.finalizeAggregateCommands({
              traceContext: null,
              args: [
                {
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  commands: [encodedCreateUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          expect(createUserBlock.failedCommands).toEqual([]);
          expect(createUserBlock.executedCommands).toHaveLength(1);
          expect(createUserBlock.executedCommands[0]?.id).toBe(
            createUserCommand.id,
          );
          expect(createUserBlock.lastAggregateCursor).toMatch(/^acur_/);

          // 5 — universal authentication resolves userId before aggregate authorization.
          const authenticationLock = yield* makeAuthenticationLock({
            signature: authenticationSignature,
          });
          const authentication = yield* makeAsync(() =>
            systemWorker.authenticate({
              authenticationLock,
              generationId,
              signature: { clerkUserId: E2E_CLERK_USER_ID_1 },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(authentication).toMatchObject({
            userId: E2E_USER_ID_1,
            authenticationLock,
          });

          const authorization = yield* makeAsync(() =>
            systemWorker.authorizeAggregateFrontend({
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
              generationId,
              userId: authentication.userId,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(authorization).toMatchObject({
            actorRef: {
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
              userId: E2E_USER_ID_1,
            },
            aggregateFrontendLock: shopperAggregateFrontendLock,
          });

          // 6 — frontend catch-up pulls and applies archived aggregate blocks.
          const frontendState = yield* makeAsync(() =>
            systemWorker.getAggregateFrontendState({
              actorRef: {
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
                userId: E2E_USER_ID_1,
              },
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
              generationId,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(frontendState).toMatchObject({
            aggregateName: shopperFrontend.aggregateName,
            userId: E2E_USER_ID_1,
            frontendName: shopperFrontend.frontendName,
          });
          expect(frontendState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: userId,
                clerkUserId: E2E_USER_ID_1,
                modelName: User.modelName,
              }),
            ]),
          );

          const aggregateBlockRepo = yield* getAggregateBlockRepo({
            key: {
              generationId,
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
            },
          });
          const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
            key: {
              generationId,
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
              userId: E2E_USER_ID_1,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const frontendIndexBeforeUpdate = frontendState.frontendIndex;

          // 7 — after bootstrap, a new aggregate command flows through fanout.
          const updateUserCommand = yield* shopperAggregate.makeCommand({
            contractName: 'updateUser',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: userId,
              name: 'E2E Shopper',
            },
          });
          const encodedUpdateUserCommand = {
            ...updateUserCommand,
            payload: yield* shopperAggregate.contracts.updateUser.encodePayload(
              { payload: updateUserCommand.payload },
            ),
          };

          const updateUserBlock = yield* makeAsync(() =>
            systemApi.finalizeAggregateCommands({
              traceContext: null,
              args: [
                {
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  commands: [encodedUpdateUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          expect(updateUserBlock.failedCommands).toEqual([]);
          expect(updateUserBlock.failure).toBeNull();
          expect(updateUserBlock.executedCommands[0]?.id).toBe(
            updateUserCommand.id,
          );
          expect(updateUserBlock.lastAggregateCursor).not.toBe(
            createUserBlock.lastAggregateCursor,
          );
          expect(updateUserBlock.aggregateIndex).toBeGreaterThan(
            createUserBlock.aggregateIndex,
          );
          const aggregateOutboxRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: {
                generationId,
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.aggregateBlockOutbox).all(),
            }),
          );
          expect(aggregateOutboxRows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                aggregateIndex: updateUserBlock.aggregateIndex,
                failure: null,
                publishedAt: expect.any(Date),
              }),
            ]),
          );

          // 8 — drain aggregate ledger fanout, then frontend delivery.
          yield* makeAsync(() =>
            aggregateBlockRepo.drainAggregateFrontendOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            aggregateFrontendRepo.drainAggregateFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          // 9 — AggregateFrontendRepo observes the update cursor.
          const projectionReadiness = yield* makeAsync(() =>
            aggregateFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const aggregateBlockState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateBlockRepo,
              repo: AggregateBlockRepo,
              key: {
                generationId,
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
              },
              fn: ({ db, schema }) => ({
                blocks: db.select().from(schema.finalizedBlocks).all(),
                subscribers: db
                  .select()
                  .from(schema.aggregateFrontendSubscribers)
                  .all(),
              }),
            }),
          );
          expect(aggregateBlockState.blocks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                aggregateIndex: updateUserBlock.aggregateIndex,
                lastAggregateCursor: updateUserBlock.lastAggregateCursor,
              }),
            ]),
          );
          expect(aggregateBlockState.subscribers).toEqual([
            expect.objectContaining({
              userId: E2E_USER_ID_1,
              currentAggregateCursor: updateUserBlock.lastAggregateCursor,
              currentAggregateIndex: updateUserBlock.aggregateIndex,
              lastDeliveryError: null,
            }),
          ]);
          expect(projectionReadiness.lastAggregateCursor).toBe(
            updateUserBlock.lastAggregateCursor,
          );

          // 10 — frontend state carries the user change produced by updateUser.
          const frontendStateAfterUpdate = yield* makeAsync(() =>
            systemWorker.getAggregateFrontendState({
              actorRef: {
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: shopperFrontend.aggregateName,
                userId: E2E_USER_ID_1,
              },
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
              generationId,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(frontendStateAfterUpdate.frontendIndex).not.toBe(
            frontendIndexBeforeUpdate,
          );
          expect(frontendStateAfterUpdate.frontendIndex).not.toBeNull();
          expect(frontendStateAfterUpdate.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: userId,
                clerkUserId: E2E_USER_ID_1,
                modelName: User.modelName,
                name: 'E2E Shopper',
              }),
            ]),
          );
        }).pipe(Effect.provide(AsyncLive), Effect.scoped),
      120_000,
    );
  });
});
