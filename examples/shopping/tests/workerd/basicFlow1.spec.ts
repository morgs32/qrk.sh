import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { newWebSocketRpcSession } from 'capnweb';
import { SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { expect } from 'vitest';

import { web as shopperFrontend } from '@/zerospin/frontends/web';
import { User } from '@/zerospin/models/User';
import { signature } from '@/zerospin/signature';
import { system } from '@/zerospin/system';

const appService = system.services.app;
const shopperAggregate = system.aggregates.shopper;
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(shopperFrontend).aggregateFrontendLock;
const aggregateId = makeAggregateId({ id: '1' });
const clerkUserId = 'user_e2e_1';
const TestLayer = makeWorkerdE2eTestLayer('basicFlow1');

describe('basicFlow1: static shopping system workerd flow', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'serves finalization, queries, authentication, and frontend state immediately',
      () =>
        Effect.gen(function* () {
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

          const createProduct = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'E2E Product',
              description: 'statically bundled service command',
              price: 10,
            },
          });
          const encodedProduct = {
            ...createProduct,
            payload: yield* appService.contracts.createProduct.encodePayload({
              payload: createProduct.payload,
            }),
          };
          const serviceFinalization = yield* makeAsync(() =>
            systemApi.finalizeServiceCommand({
              traceContext: null,
              args: [encodedProduct],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(serviceFinalization).toEqual(
            expect.objectContaining({
              id: createProduct.id,
              serviceIndex: 1,
              failedAt: null,
              failure: null,
            }),
          );

          const serviceProducts = yield* makeAsync(() =>
            systemApi.executeServiceQuery({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  queryName: 'getProducts',
                  params: {},
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(serviceProducts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ name: 'E2E Product' }),
            ]),
          );

          const userId = User.prefixId(clerkUserId);
          const createUser = yield* shopperAggregate.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: { id: userId, clerkUserId },
          });
          const encodedUser = {
            ...createUser,
            payload: yield* shopperAggregate.contracts.createUser.encodePayload(
              {
                payload: createUser.payload,
              },
            ),
          };
          const aggregateFinalization = yield* makeAsync(() =>
            systemApi.finalizeAggregateCommand({
              traceContext: null,
              args: [encodedUser],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(aggregateFinalization).toMatchObject({
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
              signature: { clerkUserId },
              aggregateId,
              aggregateName: shopperFrontend.aggregateName,
              frontendName: shopperFrontend.frontendName,
              aggregateFrontendLock: shopperAggregateFrontendLock,
            }),
          );
          const state = yield* makeAsync(() =>
            frontendApi.getState({ traceContext: null, args: [] }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(state).toMatchObject({
            aggregateId,
            aggregateName: shopperFrontend.aggregateName,
            userId: clerkUserId,
          });
        }).pipe(Effect.scoped),
      120_000,
    );
  });
});
