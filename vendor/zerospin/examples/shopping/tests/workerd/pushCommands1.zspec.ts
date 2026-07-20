import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionStagedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { makeTestApis } from '@zerospin/dispatch-worker/makeTestApis';
import { makeWorkerdE2eTestLayer } from '@zerospin/dispatch-worker/vitest/makeWorkerdE2eTestLayer';
import { SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import { getAccountBlockRepo } from 'system-worker/AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo';
import { getActorBlockRepo } from 'system-worker/ActorBlockRepo/getActorBlockRepo/getActorBlockRepo';
import { FrontendRepo } from 'system-worker/FrontendRepo/FrontendRepo';
import { getFrontendRepo } from 'system-worker/FrontendRepo/getFrontendRepo/getFrontendRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';
import { Cart, User } from '@/zerospin/models';
import { system, userAccount } from '@/zerospin/system';

const DEPLOY_NAME = 'happy_blue_whale_ab';
const E2E_ACCOUNT_ID = makeAccountId({ id: '1' });
const E2E_CLERK_USER_ID_1 = 'user_e2e_1' as const;
const E2E_ACTOR_ID_1 = prefixActorId(E2E_CLERK_USER_ID_1);

const TestLayer = makeWorkerdE2eTestLayer('pushCommands1');

describe('pushCommands1: FrontendRepo-owned push and websocket convergence', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'stages createCart in a session and receives FrontendBlockRepo websocket fanout',
      () =>
        /*
         * 1. Seed account resources.
         * 2. Open and bootstrap the frontend API.
         * 3. Create a local session DB.
         * 4. Open the frontend websocket.
         * 5. Build and stage a createCart command in the session DB.
         * 6. Push the staged row once through FrontendApi.
         * 7. Assert FrontendRepo exposes its committed optimistic state.
         * 8. Drain pushed-block finalization and account-to-frontend fanout.
         * 9. Assert websocket convergence and terminal cursor behavior.
         */
        Effect.gen(function* () {
          // 1 - seed user so frontend authentication and createCart can resolve account rows
          const userId = User.prefixId(E2E_CLERK_USER_ID_1);
          const createUser = yield* userAccount.makeCommand({
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
          yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: shopperFrontend.accountName,
                  commands: [createUser],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          // 2 - get the public frontend API and force ActorRepo bootstrap/subscription
          const frontendApi = yield* makeAsync(() =>
            apis.getFrontendApi({
              publishableKey: 'pk_test',
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              signature: { clerkUserId: E2E_CLERK_USER_ID_1 },
            }),
          );
          const frontendStateBeforePush = yield* makeAsync(() =>
            frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          // 3 - create a real session object and initialize its local command tables
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const session = makeSession({
            frontend: shopperFrontend,
            generateSignature: () =>
              Effect.succeed({ clerkUserId: E2E_CLERK_USER_ID_1 }),
            sessionId,
          });
          const models = getFrontendDbModels(session.frontend);
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeMigratedInMemoryWasmSqliteDb({
            dbConfig,
          });
          db.insert(models.user.drizzleSchema)
            .values({
              actorId: E2E_ACTOR_ID_1,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              id: userId,
              modelName: 'user',
              name: null,
              pushedCursor: null,
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              version: '1.0.0',
            })
            .run();
          session.store.setState({
            sessionId,
            accountId: E2E_ACCOUNT_ID,
            accountName: shopperFrontend.accountName,
            actorId: E2E_ACTOR_ID_1,
            generationId: 'gen_test',
            systemVersion: system.version,
            systemWorkerName: DEPLOY_NAME,
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: null,
            lastRebasedPushedCursor: null,
          });

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

          const frontendRepo = yield* getFrontendRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: shopperFrontend.accountName,
              actorId: E2E_ACTOR_ID_1,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });

          // 4 - open the frontend websocket before pushing commands
          const nonUpgradeResponse = yield* Effect.promise(() =>
            SELF.fetch(
              'http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            ),
          );
          expect(nonUpgradeResponse.status).toBe(426);

          const missingTicketResponse = yield* Effect.promise(() =>
            SELF.fetch(
              'http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test',
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          expect(missingTicketResponse.status).toBe(400);

          const invalidTicketResponse = yield* Effect.promise(() =>
            SELF.fetch(
              'http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=gen_test.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          expect(invalidTicketResponse.status).toBe(401);

          const ticket = yield* makeAsync(() =>
            frontendApi.createFrontendWebSocketTicket({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const frontendWebSocketUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          frontendWebSocketUrl.searchParams.set('publishableKey', 'pk_test');
          frontendWebSocketUrl.searchParams.set('ticket', ticket);
          const websocketResponse = yield* Effect.promise(() =>
            SELF.fetch(frontendWebSocketUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(websocketResponse.status).toBe(101);
          expect(websocketResponse.webSocket).not.toBeNull();
          const websocket = websocketResponse.webSocket!;
          websocket.accept();

          try {
            const websocketMessagePromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () =>
                  reject(
                    new Error(
                      'FrontendBlockRepo websocket fanout message timeout',
                    ),
                  ),
                30_000,
              );
              websocket.addEventListener(
                'message',
                event => {
                  clearTimeout(timeout);
                  resolve(JSON.parse((event as MessageEvent<string>).data));
                },
                { once: true },
              );
            });

            // 5 - stage a createCart command in the session DB
            const cartId = yield* Cart.makeId();
            const stagedCreateCart = yield* Effect.promise(() =>
              session.stageCommand({
                contractName: 'createCart',
                payload: { id: cartId, userId },
              }),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
            const stagedRows = db
              .select()
              .from(sessionStagedCommandDrizzleSchema)
              .all();

            expect(stagedRows).toHaveLength(1);
            expect(stagedRows[0]).toMatchObject({
              id: stagedCreateCart.id,
              commandName: 'createCart',
              status: 'staged',
              sessionId,
            });

            // 6 - one public call admits the staged row and returns its lifecycle partition
            const { pendingCommands, pushedCommands, failedCommands } =
              yield* makeAsync(() =>
                frontendApi.pushCommands({
                  traceContext: null,
                  args: [
                    {
                      commands: stagedRows,
                    },
                  ],
                }),
              ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

            expect(pendingCommands).toEqual([]);
            expect(failedCommands).toEqual([]);
            expect(pushedCommands).toHaveLength(1);
            expect(pushedCommands[0]).toMatchObject({
              id: stagedCreateCart.id,
              commandName: 'createCart',
              commandType: 'frontend',
              stagedCursor: stagedCreateCart.stagedCursor,
              stagedAt: stagedRows[0]?.stagedAt,
              status: 'pushed',
            });
            expect(pushedCommands[0]?.pushedCursor).toMatch(/^pcur_/);

            // 7 - admission is already committed to FrontendRepo's optimistic state
            const optimisticFrontendState = yield* makeAsync(() =>
              frontendApi.getFrontendState({
                traceContext: null,
                args: [],
              }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(optimisticFrontendState.lastRebasedPushedCursor).toBe(
              pushedCommands[0]?.pushedCursor,
            );
            expect(optimisticFrontendState.resources).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: cartId, modelName: 'cart' }),
              ]),
            );

            // 8 - repeated drains cannot duplicate AccountRepo finalization
            yield* makeAsync(() => frontendRepo.drainPushedBlockOutbox()).pipe(
              Effect.flatMap(encoded => decodeRpc(encoded)),
            );
            yield* makeAsync(() => frontendRepo.drainPushedBlockOutbox()).pipe(
              Effect.flatMap(encoded => decodeRpc(encoded)),
            );

            yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
              Effect.flatMap(encoded => decodeRpc(encoded)),
            );
            yield* makeAsync(() =>
              actorBlockRepo.drainFrontendSubscribers(),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
            yield* makeAsync(() =>
              frontendRepo.drainFrontendBlockOutbox(),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

            const frontendStateAfterPush = yield* makeAsync(() =>
              frontendApi.getFrontendState({
                traceContext: null,
                args: [],
              }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(frontendStateAfterPush.frontendIndex).not.toBe(
              frontendStateBeforePush.frontendIndex,
            );
            expect(frontendStateAfterPush.lastRebasedPushedCursor).toBe(
              pushedCommands[0]?.pushedCursor,
            );
            expect(frontendStateAfterPush.pushedCommands).toEqual([]);
            const pushedBlockOutboxRows = yield* Effect.promise(() =>
              executeInRepo({
                managedRuntime,
                getRepo: getFrontendRepo,
                repo: FrontendRepo,
                key: {
                  generationId: 'gen_test',
                  accountId: E2E_ACCOUNT_ID,
                  accountName: shopperFrontend.accountName,
                  actorId: E2E_ACTOR_ID_1,
                  actorName: shopperFrontend.actorName,
                  frontendName: shopperFrontend.frontendName,
                },
                fn: ({ db, schema }) =>
                  db.select().from(schema.pushedBlockOutbox).all(),
              }),
            );
            expect(pushedBlockOutboxRows).toEqual([]);

            const terminalRetry = yield* makeAsync(() =>
              frontendApi.pushCommands({
                traceContext: null,
                args: [
                  {
                    commands: stagedRows,
                  },
                ],
              }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(terminalRetry.pendingCommands).toEqual([]);
            expect(terminalRetry.pushedCommands).toEqual([]);
            expect(terminalRetry.failedCommands).toHaveLength(1);
            expect(terminalRetry.failedCommands[0]?.failure).toContain(
              'frontend-push-command-already-terminal',
            );

            const websocketMessage = (yield* Effect.promise(
              () => websocketMessagePromise,
            )) as {
              type: string;
              sync: {
                delta: {
                  inserted: readonly { id: string; modelName: string }[];
                };
                executedPushedCommands: readonly { id: string }[];
                lastRebasedPushedCursor: string | null;
              };
            };

            // 9 - websocket delivery carries the terminal outcome and final optimistic patch
            expect(websocketMessage.type).toBe('frontendBlock');
            expect(websocketMessage.sync.lastRebasedPushedCursor).toBe(
              pushedCommands[0]?.pushedCursor,
            );
            expect(websocketMessage.sync.executedPushedCommands).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: stagedCreateCart.id }),
              ]),
            );
            expect(websocketMessage.sync.delta.inserted).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: cartId,
                  modelName: 'cart',
                }),
              ]),
            );
          } finally {
            websocket.close();
          }
        }).pipe(Effect.provide(AsyncLive)),
      120_000,
    );
  });
});
