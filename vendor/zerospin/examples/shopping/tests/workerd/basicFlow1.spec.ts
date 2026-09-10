import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { newWebSocketRpcSession } from 'capnweb';
import { SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { expect } from 'vitest';

import { userV1 } from '@/zerospin/aggregates/shopper/models/user/userV1';
import { shopperV2 } from '@/zerospin/aggregates/shopper/shopperV2';
import { productV1 } from '@/zerospin/services/app/models/product/productV1';
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

const appService = system.services.app['1.0.0'];
const shopperAggregate = system.aggregates.shopper['2.0.0'];
const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(WebV2).aggregateFrontendLock;
const aggregateId = makeAggregateId({ id: '1' });
const clerkUserId = 'user_e2e_1';
const TestLayer = makeWorkerdE2eTestLayer('basicFlow1');

describe('basicFlow1: static shopping system workerd flow', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'admits service commands, awaits queries, and serves aggregate frontend state',
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
            payload: {
              id: yield* productV1.makeId(),
              name: 'E2E Product',
              description: 'statically bundled service command',
              price: 10,
            },
          });
          const encodedProduct = {
            ...createProduct,
            payload: yield* appService.contracts.createProduct.encodePayload({
              version: createProduct.contractVersion,
              payload: createProduct.payload,
            }),
          };
          const admission = yield* makeAsync(() =>
            systemApi.executeServiceCommand({
              traceContext: null,
              args: [
                { serviceVersion: appService.version, command: encodedProduct },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(admission).toEqual(
            expect.objectContaining({
              id: createProduct.id,
              serviceIndex: 1,
            }),
          );

          yield* makeAsync(() =>
            expect
              .poll(
                () =>
                  systemApi
                    .executeServiceQuery({
                      traceContext: null,
                      args: [
                        {
                          serviceName: appService.name,
                          serviceVersion: appService.version,
                          queryName: 'getProducts',
                          params: {},
                        },
                      ],
                    })
                    .then(envelope =>
                      Effect.runPromise(decodeRpc(envelope.result)),
                    ),
                { timeout: 10_000 },
              )
              .toEqual(
                expect.arrayContaining([
                  expect.objectContaining({ name: 'E2E Product' }),
                ]),
              ),
          );

          const userId = userV1.prefixId(clerkUserId);
          const createUser = yield* shopperAggregate.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: WebV2.systemName,
            payload: { id: userId, clerkUserId },
          });
          const encodedUser = {
            ...createUser,
            payload:
              yield* shopperAggregate.contracts.createUser.contract.encodePayload(
                {
                  version: createUser.contractVersion,
                  payload: createUser.payload,
                },
              ),
          };
          const aggregateFinalization = yield* makeAsync(() =>
            systemApi.executeAggregateCommand({
              traceContext: null,
              args: [
                {
                  aggregateVersion: WebV2.aggregateVersion,
                  command: encodedUser,
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(aggregateFinalization).toMatchObject({
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
              signature: { clerkUserId },
              aggregateId,
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
            aggregateId,
            aggregateName: WebV2.aggregateName,
            aggregateVersion: WebV2.aggregateVersion,
            userId: clerkUserId,
          });
        }).pipe(Effect.scoped),
      120_000,
    );
  });
});
