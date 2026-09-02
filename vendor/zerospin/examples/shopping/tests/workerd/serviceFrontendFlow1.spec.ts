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

import { catalog as catalogFrontend } from '@/zerospin/frontends/catalog';
import { signature } from '@/zerospin/signature';
import { system } from '@/zerospin/system';

const appService = system.services.app;
const catalogServiceFrontendLock =
  makeFrontendControllerSpec(catalogFrontend).serviceFrontendLock;
const TestLayer = makeWorkerdE2eTestLayer('serviceFrontendFlow1');

describe('serviceFrontendFlow1: static service frontend', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates and serves projected service state and tickets immediately',
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
          const authenticationLock = makeAuthenticationLock({
            signature,
          });
          const invalidFrontendApi = yield* makeAsync(() =>
            gatewayApi.getServiceFrontendApi({
              publishableKey: 'pk_test',
              systemName: system.name,
              authenticationLock,
              signature: { clerkUserId: 42 },
              serviceName: appService.name,
              frontendName: catalogFrontend.frontendName,
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
            systemVersion: system.version,
            payload: {
              name: 'Static catalog product',
              description: 'projected from the statically bundled System',
              price: 10,
            },
          });
          const encodedCreateProduct = {
            ...createProduct,
            payload: yield* appService.contracts.createProduct.encodePayload({
              payload: createProduct.payload,
            }),
          };
          const systemApi = yield* makeAsync(() =>
            gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test_system_runtime_capability',
            }),
          );
          const finalized = yield* makeAsync(() =>
            systemApi.finalizeServiceCommand({
              traceContext: null,
              args: [encodedCreateProduct],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(finalized).toEqual(
            expect.objectContaining({
              id: createProduct.id,
              serviceIndex: 1,
              failedAt: null,
              failure: null,
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
              frontendName: catalogFrontend.frontendName,
              serviceFrontendLock: catalogServiceFrontendLock,
            }),
          );
          const state = yield* makeAsync(() =>
            frontendApi.getState({ traceContext: null, args: [] }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(state.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ name: 'Static catalog product' }),
            ]),
          );

          const ticket = yield* makeAsync(() =>
            frontendApi.createWebSocketTicket({ traceContext: null, args: [] }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(ticket.ticket).toHaveLength(43);

          const registrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              systemId: env.ZEROSPIN_SYSTEM_ID,
            }).getRepoRegistrations({
              repoType: 'MaterializedServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(registrations).toEqual([
            expect.objectContaining({
              repoType: 'MaterializedServiceFrontendRepo',
            }),
          ]);
        }).pipe(Effect.scoped),
      120_000,
    );
  });
});
