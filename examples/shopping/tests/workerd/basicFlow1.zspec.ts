import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { makeTestApis } from '@zerospin/dispatch-worker/makeTestApis';
import { makeWorkerdE2eTestLayer } from '@zerospin/dispatch-worker/vitest/makeWorkerdE2eTestLayer';
import { exports as workerExports } from 'cloudflare:workers';
import { Effect } from 'effect';
import type { SystemWorker } from 'system-worker';
import { AccountBlockRepo } from 'system-worker/AccountBlockRepo/AccountBlockRepo';
import { getAccountBlockRepo } from 'system-worker/AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo';
import { AccountRepo } from 'system-worker/AccountRepo/AccountRepo';
import { getAccountRepo } from 'system-worker/AccountRepo/getAccountRepo/getAccountRepo';
import { getActorBlockRepo } from 'system-worker/ActorBlockRepo/getActorBlockRepo/getActorBlockRepo';
import { getActorRepo } from 'system-worker/ActorRepo/getActorRepo/getActorRepo';
import { getFrontendRepo } from 'system-worker/FrontendRepo/getFrontendRepo/getFrontendRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';
import { User } from '@/zerospin/models';
import { appService, system, userAccount } from '@/zerospin/system';

/**
 * basicFlow1 — service seeds finalize, account actor state bootstraps, and later
 * account changes publish through the AccountBlockRepo -> ActorRepo
 * -> ActorBlockRepo path.
 */

const DEPLOY_NAME = 'happy_blue_whale_ab';
const E2E_ACCOUNT_ID = makeAccountId({ id: '1' });
const E2E_CLERK_USER_ID_1 = 'user_e2e_1';
const E2E_ACTOR_ID_1 = prefixActorId(E2E_CLERK_USER_ID_1);

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
         * 3. Assert the service query sees those product rows.
         * 4. Build and finalize the account createUser command.
         * 5. Authenticate and authorize the shopper actor.
         * 6. Bootstrap frontend state from the current account snapshot.
         * 7. Build and finalize an account updateUser command after bootstrap.
         * 8. Drain account block fanout and the frontend block outbox.
         * 9. Assert ActorRepo advanced.
         * 10. Assert frontend state carries the user change.
         */
        Effect.gen(function* () {
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

          // 2 — product seeds finalize through ServiceRepo, not AccountRepo.
          const serviceFinalization = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: 'dpl_test',
              generationId: 'gen_test',
              serviceName: appService.name,
              commands: [createProductA, createProductB, createProductC],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(serviceFinalization.failedCommands).toEqual([]);
          expect(serviceFinalization.executedCommands).toHaveLength(3);
          expect(serviceFinalization.executedCommands[0]?.id).toBe(
            createProductA.id,
          );
          expect(serviceFinalization.executedCommands[1]?.id).toBe(
            createProductB.id,
          );
          expect(serviceFinalization.executedCommands[2]?.id).toBe(
            createProductC.id,
          );

          // 3 — the shopper actor API reads the service-owned product table.
          const productRows = yield* makeAsync(() =>
            systemWorker.executeActorQuery({
              accountName: shopperFrontend.accountName,
              actorId: E2E_ACTOR_ID_1,
              actorName: shopperFrontend.actorName,
              deployId: 'dpl_test',
              generationId: 'gen_test',
              queryName: 'getProducts',
              params: {},
              frontendName: shopperFrontend.frontendName,
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

          // 4 — shopper identity is account-owned and selected by actorId.
          const userId = User.prefixId(E2E_CLERK_USER_ID_1);
          const createUserCommand = yield* userAccount.makeCommand({
            contractName: 'createUser',
            accountId: E2E_ACCOUNT_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: userId,
              clerkUserId: E2E_CLERK_USER_ID_1,
            },
          });

          const apis = makeTestApis();
          const systemApi = yield* makeAsync(() =>
            apis.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );
          const createUserBlock = yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: shopperFrontend.accountName,
                  commands: [createUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          expect(createUserBlock.failedCommands).toEqual([]);
          expect(createUserBlock.executedCommands).toHaveLength(1);
          expect(createUserBlock.executedCommands[0]?.id).toBe(
            createUserCommand.id,
          );
          expect(createUserBlock.lastAccountCursor).toMatch(/^acur_/);

          // 5 — authenticate returns the actor and authorize records the frontend grant.
          const actor = yield* makeAsync(() =>
            systemWorker.authenticate({
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              deployId: 'dpl_test',
              frontendName: shopperFrontend.frontendName,
              generationId: 'gen_test',
              signature: { clerkUserId: E2E_CLERK_USER_ID_1 },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(actor).toEqual({
            accountId: E2E_ACCOUNT_ID,
            actorId: E2E_ACTOR_ID_1,
          });

          yield* makeAsync(() =>
            systemWorker.authorize({
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              deployId: 'dpl_test',
              frontendName: shopperFrontend.frontendName,
              generationId: 'gen_test',
              actor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          // 6 — frontend bootstrap snapshots the user row from account -> actor -> frontend.
          const frontendState = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorId: E2E_ACTOR_ID_1,
              actorName: shopperFrontend.actorName,
              deployId: 'dpl_test',
              frontendName: shopperFrontend.frontendName,
              generationId: 'gen_test',
              systemWorkerName: DEPLOY_NAME,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(frontendState).toMatchObject({
            accountName: shopperFrontend.accountName,
            actorId: E2E_ACTOR_ID_1,
            actorName: shopperFrontend.actorName,
            systemWorkerName: DEPLOY_NAME,
            frontendName: shopperFrontend.frontendName,
          });
          expect(frontendState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: userId,
                actorId: E2E_ACTOR_ID_1,
                modelName: User.modelName,
              }),
            ]),
          );

          const accountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
            },
          });
          const actorBlockRepo = yield* getActorBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              actorId: E2E_ACTOR_ID_1,
            },
          });
          const actorRepo = yield* getActorRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              actorId: E2E_ACTOR_ID_1,
            },
          });
          const frontendRepo = yield* getFrontendRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              actorId: E2E_ACTOR_ID_1,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const frontendIndexBeforeUpdate = frontendState.frontendIndex;

          // 7 — after bootstrap, a new account command should flow through fanout.
          const updateUserCommand = yield* userAccount.makeCommand({
            contractName: 'updateUser',
            accountId: E2E_ACCOUNT_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: userId,
              name: 'E2E Shopper',
            },
          });

          const updateUserBlock = yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: shopperFrontend.accountName,
                  commands: [updateUserCommand],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          expect(updateUserBlock.failedCommands).toEqual([]);
          expect(updateUserBlock.failure).toBeNull();
          expect(updateUserBlock.executedCommands[0]?.id).toBe(
            updateUserCommand.id,
          );
          expect(updateUserBlock.lastAccountCursor).not.toBe(
            createUserBlock.lastAccountCursor,
          );
          expect(updateUserBlock.accountIndex).toBeGreaterThan(
            createUserBlock.accountIndex,
          );
          const accountOutboxRows = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: 'gen_test',
                accountId: E2E_ACCOUNT_ID,
                accountName: shopperFrontend.accountName,
              },
              fn: ({ db, schema }) =>
                db.select().from(schema.accountBlockOutbox).all(),
            }),
          );
          expect(accountOutboxRows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                accountIndex: updateUserBlock.accountIndex,
                failure: null,
                publishedAt: expect.any(Date),
              }),
            ]),
          );

          // 8 — drain account ledger fanout, then frontend delivery.
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() => frontendRepo.drainFrontendBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          // 9 — ActorRepo observes the update cursor.
          const actorLastAccountCursor = yield* makeAsync(() =>
            actorRepo.getLastAccountCursor(),
          ).pipe(Effect.flatMap(decodeRpc));
          const accountBlockState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountBlockRepo,
              repo: AccountBlockRepo,
              key: {
                generationId: 'gen_test',
                accountId: E2E_ACCOUNT_ID,
                accountName: shopperFrontend.accountName,
              },
              fn: ({ db, schema }) => ({
                blocks: db.select().from(schema.finalizedBlocks).all(),
                subscribers: db.select().from(schema.actorSubscribers).all(),
              }),
            }),
          );
          expect(accountBlockState.blocks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                accountIndex: updateUserBlock.accountIndex,
                lastAccountCursor: updateUserBlock.lastAccountCursor,
              }),
            ]),
          );
          expect(accountBlockState.subscribers).toEqual([
            expect.objectContaining({
              actorId: E2E_ACTOR_ID_1,
              currentAccountCursor: updateUserBlock.lastAccountCursor,
              currentAccountIndex: updateUserBlock.accountIndex,
              lastDeliveryError: null,
            }),
          ]);
          const actorResourcesAfterUpdate = yield* makeAsync(() =>
            actorRepo.dumpActorModelResources({
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              modelName: User.modelName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(actorLastAccountCursor).toBe(
            updateUserBlock.lastAccountCursor,
          );
          expect(actorResourcesAfterUpdate).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: userId,
                actorId: E2E_ACTOR_ID_1,
                modelName: User.modelName,
                name: 'E2E Shopper',
              }),
            ]),
          );

          // 10 — frontend state carries the user change produced by updateUser.
          const frontendStateAfterUpdate = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorId: E2E_ACTOR_ID_1,
              actorName: shopperFrontend.actorName,
              deployId: 'dpl_test',
              frontendName: shopperFrontend.frontendName,
              generationId: 'gen_test',
              systemWorkerName: DEPLOY_NAME,
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
                actorId: E2E_ACTOR_ID_1,
                modelName: User.modelName,
                name: 'E2E Shopper',
              }),
            ]),
          );
        }).pipe(Effect.provide(AsyncLive)),
      120_000,
    );
  });
});
