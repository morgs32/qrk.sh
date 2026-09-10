import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { newWebSocketRpcSession } from 'capnweb';
import { env, SELF } from 'cloudflare:test';
import { Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { afterAll, expect } from 'vitest';

import { cartV1 } from '@/zerospin/aggregates/shopper/models/cart/cartV1';
import { userV1 } from '@/zerospin/aggregates/shopper/models/user/userV1';
import { shopperV2 } from '@/zerospin/aggregates/shopper/shopperV2';
import { signature } from '@/zerospin/signature';
import { system } from '@/zerospin/system';
const WebV2 = makeFrontendController({
  systemName: 'shopping',
  aggregateName: shopperV2.name,
  aggregateVersion: shopperV2.version,
  name: 'web',
  models: shopperV2.models,
  contracts: shopperV2.contracts,
});

const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const shopperAggregate = system.aggregates.shopper['2.0.0'];
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(WebV2).aggregateFrontendLock;

const E2E_AGGREGATE_ID = makeAggregateId({ id: '1' });
const E2E_CLERK_USER_ID_1 = 'user_e2e_1';
const E2E_USER_ID_1 = E2E_CLERK_USER_ID_1;

const TestLayer = makeWorkerdE2eTestLayer('pushCommand1');

describe('pushCommand1: static frontend command push', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'finalizes through static ingress and serves state, ticket, and push leaves',
      () =>
        Effect.gen(function* () {
          const userId = userV1.prefixId(E2E_CLERK_USER_ID_1);
          const createUser = yield* shopperAggregate.makeCommand({
            contractName: 'createUser',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: WebV2.systemName,
            payload: {
              id: userId,
              clerkUserId: E2E_CLERK_USER_ID_1,
            },
          });
          const encodedCreateUser = {
            ...createUser,
            payload:
              yield* shopperAggregate.contracts.createUser.contract.encodePayload(
                {
                  version: createUser.contractVersion,
                  payload: createUser.payload,
                },
              ),
          };

          const gatewayApi = yield* Effect.acquireRelease(
            makeAsync(async () => {
              const response = await SELF.fetch(
                new Request('https://shopping.test/rpc', {
                  headers: { Upgrade: 'websocket' },
                }),
              );
              if (response.webSocket === null) {
                throw new Error('Shopping Worker did not return a WebSocket');
              }
              response.webSocket.accept();
              return newWebSocketRpcSession<GatewayApi>(response.webSocket);
            }),
            gateway => Effect.sync(() => gateway[Symbol.dispose]()),
          );
          const systemApi = yield* makeAsync(() =>
            gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test_system_runtime_capability',
            }),
          );
          const finalized = yield* makeAsync(() =>
            systemApi.executeAggregateCommand({
              traceContext: null,
              args: [
                {
                  aggregateVersion: WebV2.aggregateVersion,
                  command: encodedCreateUser,
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(finalized).toMatchObject({
            aggregateIndex: 1,
            id: createUser.id,
            failedAt: null,
            failure: null,
          });

          const authenticationLock = makeAuthenticationLock(signature);
          const frontendApi = yield* makeAsync(() =>
            gatewayApi.getAggregateFrontendApi({
              publishableKey: 'pk_test',
              systemName: system.name,
              authenticationLock,
              signature: { clerkUserId: E2E_CLERK_USER_ID_1 },
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: WebV2.aggregateName,
              aggregateVersion: WebV2.aggregateVersion,
              frontendName: WebV2.name,
              aggregateFrontendLock: shopperAggregateFrontendLock,
            }),
          );

          const state = yield* makeAsync(() =>
            frontendApi.getState({
              traceContext: null,
              args: [{ outstandingCommandIds: [] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(state).toMatchObject({
            aggregateId: E2E_AGGREGATE_ID,
            userId: E2E_USER_ID_1,
          });

          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const session = Effect.runSync(
            Effect.map(WebV2.initializeGuards, guards =>
              makeAggregateSession({
                runtime: guardTestRuntime,
                guards,
                frontend: WebV2,
                sessionId,
              }),
            ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
          );
          const models = getFrontendDbModels(session.frontend);
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          yield* applyAggregateFrontendState({
            frontend: WebV2,
            sessionId,
            aggregateId: E2E_AGGREGATE_ID,
            userId: E2E_USER_ID_1,
            systemId: env.ZEROSPIN_SYSTEM_ID,
            db,
            models,
            frontendState: state,
          });
          session.store.setState({
            sessionId,
            aggregateId: E2E_AGGREGATE_ID,
            aggregateName: WebV2.aggregateName,
            aggregateVersion: WebV2.aggregateVersion,
            userId: E2E_USER_ID_1,
            systemId: env.ZEROSPIN_SYSTEM_ID,
            frontendName: WebV2.name,
            aggregateFrontendLockKey: yield* makeAggregateFrontendLockKey(
              shopperAggregateFrontendLock,
            ),
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            aggregateIndex: state.aggregateIndex,
            userIndex: state.userIndex,
            pushIndex: 0,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });
          const cartId = yield* cartV1.makeId();
          const localCreateCart = yield* decodeRpc(
            session.executeCommand({
              contractName: 'createCart',
              payload: { id: cartId, userId },
            }),
          );
          const encodedLocalCreateCart = {
            ...localCreateCart,
            payload: yield* WebV2.contracts.createCart.contract.encodePayload({
              version: localCreateCart.contractVersion,
              payload: localCreateCart.payload,
            }),
          };
          const journalRows = db
            .select()
            .from(sessionCommandJournalDrizzleSchema)
            .all();
          expect(journalRows).toEqual([
            expect.objectContaining({
              id: localCreateCart.id,
              commandName: 'createCart',
              sessionId,
              sessionIndex: 1,
            }),
          ]);

          const ticket = yield* makeAsync(() =>
            frontendApi.createWebSocketTicket({
              traceContext: null,
              args: [{ aggregateVersion: state.aggregateVersion }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(ticket.ticket).toHaveLength(43);

          const pushedCommand = yield* makeAsync(() =>
            frontendApi.pushCommand({
              traceContext: null,
              args: [{ command: encodedLocalCreateCart }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(pushedCommand).toEqual(
            expect.objectContaining({
              commandId: localCreateCart.id,
              aggregateIndex: 2,
            }),
          );

          const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
          expect(
            yield* makeAsync(() =>
              systemRepo.getRepoRegistrations({
                repoType: 'UserVersionedAggregateRepo',
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          ).toEqual([
            expect.objectContaining({
              repoType: 'UserVersionedAggregateRepo',
            }),
          ]);
        }).pipe(Effect.provide(AsyncLive), Effect.scoped),
      120_000,
    );
  });
});
