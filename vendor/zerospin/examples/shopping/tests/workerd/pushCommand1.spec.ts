import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { newWebSocketRpcSession } from 'capnweb';
import { env, SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { expect } from 'vitest';

import { web as shopperFrontend } from '@/zerospin/frontends/web';
import { Cart } from '@/zerospin/models/Cart';
import { User } from '@/zerospin/models/User';
import { signature } from '@/zerospin/signature';
import { system } from '@/zerospin/system';

const shopperAggregate = system.aggregates.shopper;
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(shopperFrontend).aggregateFrontendLock;

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
            systemApi.finalizeAggregateCommand({
              traceContext: null,
              args: [encodedCreateUser],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(finalized).toMatchObject({
            aggregateIndex: 1,
            id: createUser.id,
            failedAt: null,
            failure: null,
          });

          const authenticationLock = makeAuthenticationLock({
            signature,
          });
          const frontendApi = yield* makeAsync(() =>
            gatewayApi.getAggregateFrontendApi({
              publishableKey: 'pk_test',
              systemName: system.name,
              authenticationLock,
              signature: { clerkUserId: E2E_CLERK_USER_ID_1 },
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: shopperFrontend.aggregateName,
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
            }),
          );

          const state = yield* makeAsync(() =>
            frontendApi.getState({ traceContext: null, args: [] }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(state).toMatchObject({
            aggregateId: E2E_AGGREGATE_ID,
            userId: E2E_USER_ID_1,
          });

          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const session = makeSession({
            frontend: shopperFrontend,
            sessionId,
          });
          const models = getFrontendDbModels(session.frontend);
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const { schema } = dbConfig;
          const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
          yield* applyAggregateFrontendState({
            frontend: shopperFrontend,
            sessionId,
            aggregateId: E2E_AGGREGATE_ID,
            userId: E2E_USER_ID_1,
            systemId: env.ZEROSPIN_SYSTEM_ID,
            db,
            models,
            frontendState: state,
            pushedCommands: [],
          });
          session.store.setState({
            sessionId,
            aggregateId: E2E_AGGREGATE_ID,
            aggregateName: shopperFrontend.aggregateName,
            userId: E2E_USER_ID_1,
            systemId: env.ZEROSPIN_SYSTEM_ID,
            systemVersion: system.version,
            frontendName: shopperFrontend.frontendName,
            db,
            schema,
            models,
            isInitialized: true,
            aggregateIndex: state.aggregateIndex,
            frontendIndex: state.frontendIndex,
            pushIndex: state.pushIndex,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });
          const cartId = yield* Cart.makeId();
          const localCreateCart = yield* decodeRpc(
            session.executeCommand({
              contractName: 'createCart',
              payload: { id: cartId, userId },
            }),
          );
          const encodedLocalCreateCart = {
            ...localCreateCart,
            payload: yield* shopperFrontend.contracts.createCart.encodePayload({
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
              args: [],
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
              id: localCreateCart.id,
              pushIndex: 1,
            }),
          );

          const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
          expect(
            yield* makeAsync(() =>
              systemRepo.getRepoRegistrations({
                repoType: 'MaterializedAggregateFrontendRepo',
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          ).toEqual([
            expect.objectContaining({
              repoType: 'MaterializedAggregateFrontendRepo',
            }),
          ]);
        }).pipe(Effect.provide(AsyncLive), Effect.scoped),
      120_000,
    );
  });
});
