import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { newWebSocketRpcSession } from 'capnweb';
import { env, SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import { expect } from 'vitest';

import { appV1 } from '@/zerospin/services/app/appV1';
import { productV1 } from '@/zerospin/services/app/models/product/productV1';
import { signature } from '@/zerospin/signature';
import { system } from '@/zerospin/system';

const CatalogV1 = appV1.frontends.catalog.controller;

const appService = system.services.app['1.0.0'];
const catalogServiceFrontendLock =
  makeFrontendControllerSpec(CatalogV1).serviceFrontendLock;
const TestLayer = makeWorkerdE2eTestLayer('serviceFrontendFlow1');

describe('serviceFrontendFlow1: static service frontend', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates and eventually serves projected service state and tickets',
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
          const authenticationLock = makeAuthenticationLock(signature);
          const invalidFrontendApi = yield* makeAsync(() =>
            gatewayApi.getServiceFrontendApi({
              publishableKey: 'pk_test',
              systemName: system.name,
              authenticationLock,
              signature: { clerkUserId: 42 },
              serviceName: appService.name,
              serviceVersion: appService.version,
              frontendName: CatalogV1.name,
              serviceFrontendLock: catalogServiceFrontendLock,
            }),
          );
          const invalidAuthentication = yield* makeAsync(() =>
            invalidFrontendApi.getState({ traceContext: null, args: [] }),
          ).pipe(
            Effect.flatMap(envelope => decodeRpc(envelope.result)),
            Effect.result,
          );
          expect(invalidAuthentication._tag).toBe('Failure');

          const createProduct = yield* appService.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: yield* productV1.makeId(),
              name: 'Static catalog product',
              description: 'projected from the statically bundled System',
              price: 10,
            },
          });
          const encodedCreateProduct = {
            ...createProduct,
            payload: yield* appService.contracts.createProduct.encodePayload({
              version: createProduct.contractVersion,
              payload: createProduct.payload,
            }),
          };
          const systemApi = yield* makeAsync(() =>
            gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test_system_runtime_capability',
            }),
          );
          const admission = yield* makeAsync(() =>
            systemApi.executeServiceCommand({
              traceContext: null,
              args: [
                {
                  serviceVersion: appService.version,
                  command: encodedCreateProduct,
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(admission).toEqual(
            expect.objectContaining({
              id: createProduct.id,
              serviceIndex: 1,
            }),
          );

          const userId = 'catalog_static_user';
          const frontendApi = yield* makeAsync(() =>
            gatewayApi.getServiceFrontendApi({
              publishableKey: 'pk_test',
              systemName: system.name,
              authenticationLock,
              signature: { clerkUserId: userId },
              serviceName: appService.name,
              serviceVersion: appService.version,
              frontendName: CatalogV1.name,
              serviceFrontendLock: catalogServiceFrontendLock,
            }),
          );
          yield* makeAsync(() =>
            expect
              .poll(
                async () => {
                  const envelope = await frontendApi.getState({
                    traceContext: null,
                    args: [],
                  });
                  const state = await Effect.runPromise(
                    decodeRpc(envelope.result),
                  );
                  return state.resources;
                },
                { timeout: 10_000 },
              )
              .toEqual(
                expect.arrayContaining([
                  expect.objectContaining({ name: 'Static catalog product' }),
                ]),
              ),
          );

          const snapshot = yield* makeAsync(() =>
            frontendApi.getState({ traceContext: null, args: [] }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const ticket = yield* makeAsync(() =>
            frontendApi.createWebSocketTicket({
              traceContext: null,
              args: [{ serviceVersion: snapshot.serviceVersion }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(ticket.ticket).toHaveLength(43);

          const systemRepo = yield* SystemRepo.getRepo({
            key: {
              systemId: env.ZEROSPIN_SYSTEM_ID,
            },
          });
          const registrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'FrontendVersionedServiceRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(registrations).toEqual([
            expect.objectContaining({
              repoType: 'FrontendVersionedServiceRepo',
            }),
          ]);
        }).pipe(Effect.scoped),
      120_000,
    );
  });
});
