import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionStagedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { makeTestGateway } from '@zerospin/dev-worker/makeTestGateway';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { getAggregateBlockRepo } from 'system-worker/AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo';
import { AggregateFrontendRepo } from 'system-worker/AggregateFrontendRepo/AggregateFrontendRepo';
import { getAggregateFrontendRepo } from 'system-worker/AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo';
import { AggregateRepo } from 'system-worker/AggregateRepo/AggregateRepo';
import { getAggregateRepo } from 'system-worker/AggregateRepo/getAggregateRepo/getAggregateRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect } from 'vitest';

import { authenticationSignature } from '@/zerospin/authentication';
import { shopperFrontend } from '@/zerospin/frontend';
import { Cart, User } from '@/zerospin/models';
import { system } from '@/zerospin/system';

const shopperAggregate = system.aggregates.shopper;
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(shopperFrontend).aggregateFrontendLock;

const E2E_AGGREGATE_ID = makeAggregateId({ id: '1' });
const E2E_CLERK_USER_ID_1 = 'user_e2e_1' as const;
const E2E_USER_ID_1 = E2E_CLERK_USER_ID_1;

const TestLayer = makeWorkerdE2eTestLayer('pushCommands1');

describe('pushCommands1: AggregateFrontendRepo-owned push and websocket convergence', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'stages createCart in a session and receives AggregateFrontendBlockRepo websocket fanout',
      () =>
        /*
         * 1. Seed aggregate resources.
         * 2. Open and bootstrap the frontend API.
         * 3. Create a local session DB.
         * 4. Open the frontend websocket.
         * 5. Build and stage a createCart command in the session DB.
         * 6. Push the staged rows through AggregateFrontendApi.
         * 7. Assert AggregateFrontendRepo exposes its committed optimistic state.
         * 8. Drain pushed-block finalization and aggregate-to-frontend fanout.
         * 9. Assert websocket convergence and terminal cursor behavior.
         */
        Effect.gen(function* () {
          // 1 - seed user so authentication and createCart resolve aggregate rows
          const userId = User.prefixId(E2E_CLERK_USER_ID_1);
          const createUser = yield* shopperAggregate.makeCommand({
            contractName: 'createUser',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: userId,
              clerkUserId: E2E_CLERK_USER_ID_1,
            },
          });
          const encodedCreateUser = {
            ...createUser,
            payload: yield* shopperAggregate.contracts.createUser.encodePayload(
              { payload: createUser.payload },
            ),
          };

          const { gatewayApi, generationId } = yield* Effect.acquireRelease(
            makeAsync(makeTestGateway),
            opened => Effect.sync(() => opened.gatewayApi[Symbol.dispose]()),
          );
          const systemApi = yield* makeAsync(() =>
            gatewayApi.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );
          yield* makeAsync(() =>
            systemApi.finalizeAggregateCommands({
              traceContext: null,
              args: [
                {
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  commands: [encodedCreateUser],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          // 2 - get the public frontend API and force AggregateFrontendRepo bootstrap/subscription
          const authenticationLock = yield* makeAuthenticationLock({
            signature: authenticationSignature,
          });
          const authenticatedApi = yield* makeAsync(() =>
            gatewayApi.getAuthenticatedApi({
              publishableKey: 'pk_test',
              authenticationLock,
              signature: { clerkUserId: E2E_CLERK_USER_ID_1 },
            }),
          );
          yield* makeAsync(() => authenticatedApi.getAuthentication()).pipe(
            Effect.flatMap(decodeRpc),
          );
          const frontendApi = yield* makeAsync(() =>
            authenticatedApi.getAggregateFrontendApi({
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
            }),
          );
          yield* makeAsync(() => frontendApi.getAdmission()).pipe(
            Effect.flatMap(decodeRpc),
          );
          const frontendStateBeforePush = yield* makeAsync(() =>
            frontendApi.getState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          // 3 - create a real session object and initialize its local command tables
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const secondSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const session = makeSession({
            frontend: shopperFrontend,
            sessionId,
          });
          const secondSession = makeSession({
            frontend: shopperFrontend,
            sessionId: secondSessionId,
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
          const secondDb = yield* makeMigratedInMemoryWasmSqliteDb({
            dbConfig,
          });
          db.insert(models.user.drizzleSchema)
            .values({
              clerkUserId: E2E_USER_ID_1,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              id: userId,
              modelName: 'user',
              name: null,
              pushedCursor: null,
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              version: '1.0.0',
            })
            .run();
          secondDb
            .insert(models.user.drizzleSchema)
            .values({
              clerkUserId: E2E_USER_ID_1,
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
            aggregateId: E2E_AGGREGATE_ID,
            aggregateName: shopperFrontend.aggregateName,
            userId: E2E_USER_ID_1,
            systemId: frontendStateBeforePush.systemId,
            systemVersion: system.version,
            frontendName: shopperFrontend.frontendName,
            db,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: frontendStateBeforePush.frontendIndex,
            replicaIndex: null,
            lastRebasedPushedCursor: null,
          });
          secondSession.store.setState({
            sessionId: secondSessionId,
            aggregateId: E2E_AGGREGATE_ID,
            aggregateName: shopperFrontend.aggregateName,
            userId: E2E_USER_ID_1,
            systemId: frontendStateBeforePush.systemId,
            systemVersion: system.version,
            frontendName: shopperFrontend.frontendName,
            db: secondDb,
            schema,
            models,
            vfsName: null,
            isInitialized: true,
            frontendIndex: frontendStateBeforePush.frontendIndex,
            replicaIndex: null,
            lastRebasedPushedCursor: null,
          });

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
          const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);

          // 4 - makeTestGateway activates one generated System generation, so
          // exercise its matching SystemRepo WebSocket boundary directly.
          const nonUpgradeResponse = yield* Effect.promise(() =>
            systemRepo.fetch(
              'http://zerospin-test-rpc.invalid/ws-aggregate-frontend-blocks?ticket=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            ),
          );
          expect(nonUpgradeResponse.status).toBe(426);

          const missingTicketResponse = yield* Effect.promise(() =>
            systemRepo.fetch(
              'http://zerospin-test-rpc.invalid/ws-aggregate-frontend-blocks',
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          expect(missingTicketResponse.status).toBe(400);

          const invalidTicketResponse = yield* Effect.promise(() =>
            systemRepo.fetch(
              `http://zerospin-test-rpc.invalid/ws-aggregate-frontend-blocks?ticket=${generationId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          expect(invalidTicketResponse.status).toBe(401);

          const ticket = yield* makeAsync(() =>
            frontendApi.createWebSocketTicket({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const frontendWebSocketUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-aggregate-frontend-blocks',
          );
          frontendWebSocketUrl.searchParams.set('ticket', ticket.ticket);
          const websocketResponse = yield* Effect.promise(() =>
            systemRepo.fetch(frontendWebSocketUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(websocketResponse.status).toBe(101);
          expect(websocketResponse.webSocket).not.toBeNull();
          const websocket = websocketResponse.webSocket!;
          websocket.accept();

          try {
            const replayCompletePromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () =>
                  reject(
                    new Error(
                      'AggregateFrontendBlockRepo replay-complete message timeout',
                    ),
                  ),
                30_000,
              );
              websocket.addEventListener(
                'message',
                event => {
                  clearTimeout(timeout);
                  if (typeof event.data !== 'string') {
                    reject(
                      new Error(
                        'AggregateFrontendBlockRepo replay-complete message must be text',
                      ),
                    );
                    return;
                  }
                  resolve(JSON.parse(event.data));
                },
                { once: true },
              );
            });
            websocket.send(
              JSON.stringify({
                frontendIndex: frontendStateBeforePush.frontendIndex,
              }),
            );
            expect(yield* Effect.promise(() => replayCompletePromise)).toEqual({
              type: 'replay-complete',
              frontendIndex: frontendStateBeforePush.frontendIndex,
            });

            const websocketMessagePromise = new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () =>
                  reject(
                    new Error(
                      'AggregateFrontendBlockRepo websocket fanout message timeout',
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
            const stagedCreateCart = yield* decodeRpc(
              session.stageCommand({
                contractName: 'createCart',
                payload: { id: cartId, userId },
              }),
            );
            const stagedUpdateUser = yield* decodeRpc(
              secondSession.stageCommand({
                contractName: 'updateUser',
                payload: { id: userId, name: 'Mixed session update' },
              }),
            );
            const stagedRows = [
              ...db.select().from(sessionStagedCommandDrizzleSchema).all(),
              ...secondDb
                .select()
                .from(sessionStagedCommandDrizzleSchema)
                .all(),
            ];

            expect(stagedRows).toHaveLength(2);
            expect(stagedRows[0]).toMatchObject({
              id: stagedCreateCart.id,
              commandName: 'createCart',
              status: 'staged',
              sessionId,
            });
            expect(stagedRows[1]).toMatchObject({
              id: stagedUpdateUser.id,
              commandName: 'updateUser',
              status: 'staged',
              sessionId: secondSessionId,
            });

            // 6 - one public call admits the staged rows and returns their lifecycle partition
            const {
              pendingCommands,
              pushedCommands,
              executedCommands,
              failedStagedCommands,
              failedPushedCommands,
            } = yield* makeAsync(() =>
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
            expect(executedCommands).toEqual([]);
            expect(failedStagedCommands).toEqual([]);
            expect(failedPushedCommands).toEqual([]);
            expect(pushedCommands).toHaveLength(2);
            expect(pushedCommands.map(command => command.id)).toEqual([
              stagedCreateCart.id,
              stagedUpdateUser.id,
            ]);
            expect(pushedCommands[0]).toMatchObject({
              id: stagedCreateCart.id,
              commandName: 'createCart',
              commandType: 'frontend',
              stagedCursor: stagedCreateCart.stagedCursor,
              stagedAt: stagedRows[0]?.stagedAt,
              status: 'pushed',
            });
            expect(pushedCommands[0]?.pushedCursor).toMatch(/^pcur_/);
            expect(pushedCommands[1]).toMatchObject({
              id: stagedUpdateUser.id,
              sessionId: secondSessionId,
              status: 'pushed',
            });
            expect(pushedCommands[1]?.pushedCursor).toMatch(/^pcur_/);

            // 7 - admission is already committed to AggregateFrontendRepo's optimistic state
            const optimisticFrontendState = yield* makeAsync(() =>
              frontendApi.getState({
                traceContext: null,
                args: [],
              }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(optimisticFrontendState.lastRebasedPushedCursor).toBe(
              pushedCommands[1]?.pushedCursor,
            );
            expect(optimisticFrontendState.resources).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: cartId, modelName: 'cart' }),
                expect.objectContaining({
                  id: userId,
                  modelName: 'user',
                  name: 'Mixed session update',
                }),
              ]),
            );
            const admissionPersistence = yield* Effect.promise(() =>
              executeInRepo({
                managedRuntime,
                getRepo: getAggregateFrontendRepo,
                repo: AggregateFrontendRepo,
                key: {
                  generationId,
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  userId: E2E_USER_ID_1,
                  frontendName: shopperFrontend.frontendName,
                },
                fn: ({ state }) => ({
                  firstSessionWatermark: state.storage.kv.get(
                    `processedStagedCursor:${sessionId}`,
                  ),
                  secondSessionWatermark: state.storage.kv.get(
                    `processedStagedCursor:${secondSessionId}`,
                  ),
                }),
              }),
            );
            expect(admissionPersistence.firstSessionWatermark).toBe(
              stagedCreateCart.stagedCursor,
            );
            expect(admissionPersistence.secondSessionWatermark).toBe(
              stagedUpdateUser.stagedCursor,
            );
            const aggregatePersistence = yield* Effect.promise(() =>
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
                  db
                    .select()
                    .from(schema.aggregateBlockOutbox)
                    .all()
                    .filter(row => row.pushedBlockId !== null),
              }),
            );
            expect(aggregatePersistence).toHaveLength(1);
            expect(
              JSON.parse(String(aggregatePersistence[0]?.executedCommands)),
            ).toMatchObject([
              { id: stagedCreateCart.id, sessionId },
              { id: stagedUpdateUser.id, sessionId: secondSessionId },
            ]);

            // 8 - repeated drains cannot duplicate AggregateRepo finalization
            yield* makeAsync(() =>
              aggregateFrontendRepo.drainPushedBlockOutbox(),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
            yield* makeAsync(() =>
              aggregateFrontendRepo.drainPushedBlockOutbox(),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

            yield* makeAsync(() =>
              aggregateBlockRepo.drainAggregateFrontendOutbox(),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
            yield* makeAsync(() =>
              aggregateFrontendRepo.drainAggregateFrontendBlockOutbox(),
            ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));

            const frontendStateAfterPush = yield* makeAsync(() =>
              frontendApi.getState({
                traceContext: null,
                args: [],
              }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(frontendStateAfterPush.frontendIndex).not.toBe(
              frontendStateBeforePush.frontendIndex,
            );
            expect(frontendStateAfterPush.lastRebasedPushedCursor).toBe(
              pushedCommands[1]?.pushedCursor,
            );
            expect(frontendStateAfterPush.pushedCommands).toEqual([]);
            const pushedBlockOutboxRows = yield* Effect.promise(() =>
              executeInRepo({
                managedRuntime,
                getRepo: getAggregateFrontendRepo,
                repo: AggregateFrontendRepo,
                key: {
                  generationId,
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: shopperFrontend.aggregateName,
                  userId: E2E_USER_ID_1,
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
            expect(terminalRetry.failedStagedCommands).toEqual([]);
            expect(terminalRetry.failedPushedCommands).toEqual([]);
            expect(
              terminalRetry.executedCommands.map(command => command.id),
            ).toEqual([stagedCreateCart.id, stagedUpdateUser.id]);

            const websocketMessage = (yield* Effect.promise(
              () => websocketMessagePromise,
            )) as {
              type: string;
              sync: {
                delta: {
                  inserted: readonly { id: string; modelName: string }[];
                  updated: readonly {
                    id: string;
                    modelName: string;
                    name: string | null;
                  }[];
                };
                executedPushedCommands: readonly { id: string }[];
                lastRebasedPushedCursor: string | null;
              };
            };

            // 9 - websocket delivery carries the terminal outcome and final optimistic patch
            expect(websocketMessage.type).toBe('aggregateFrontendBlock');
            expect(websocketMessage.sync.lastRebasedPushedCursor).toBe(
              pushedCommands[1]?.pushedCursor,
            );
            expect(websocketMessage.sync.executedPushedCommands).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: stagedCreateCart.id }),
                expect.objectContaining({ id: stagedUpdateUser.id }),
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
            expect(websocketMessage.sync.delta.updated).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: userId,
                  modelName: 'user',
                  name: 'Mixed session update',
                }),
              ]),
            );
          } finally {
            websocket.close();
          }
        }).pipe(Effect.provide(AsyncLive), Effect.scoped),
      120_000,
    );
  });
});
