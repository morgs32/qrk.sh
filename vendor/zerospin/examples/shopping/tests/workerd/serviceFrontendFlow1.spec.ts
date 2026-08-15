import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeTestGateway } from '@zerospin/dev-worker/makeTestGateway';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import { expect } from 'vitest';

import { authenticationSignature } from '@/zerospin/authentication';
import { catalogFrontend } from '@/zerospin/frontend';
import { system } from '@/zerospin/system';

const appService = system.services.app;
const catalogServiceFrontendLock =
  makeFrontendControllerSpec(catalogFrontend).serviceFrontendLock;

const TestLayer = makeWorkerdE2eTestLayer('serviceFrontendFlow1');

describe('serviceFrontendFlow1: static service-owned actor projection', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates exact frontend definitions and materializes isolated actor state',
      () =>
        Effect.gen(function* () {
          const { gatewayApi, generationId } = yield* Effect.acquireRelease(
            makeAsync(makeTestGateway),
            opened => Effect.sync(() => opened.gatewayApi[Symbol.dispose]()),
          );
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const authenticationLock = yield* makeAuthenticationLock({
            signature: authenticationSignature,
          });
          const invalidAuthenticatedApi = yield* makeAsync(() =>
            gatewayApi.getAuthenticatedApi({
              publishableKey: 'pk_test',
              authenticationLock,
              signature: { clerkUserId: 42 },
            }),
          );
          const invalidAuthentication = yield* makeAsync(() =>
            invalidAuthenticatedApi.getAuthentication(),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(invalidAuthentication._tag).toBe('Left');
          expect(
            yield* makeAsync(() =>
              systemRepo.getRepoRegistrations({
                generationId,
                repoType: 'ServiceFrontendRepo',
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          ).toEqual([]);

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
            gatewayApi.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );
          const finalizedEnvelope = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: [encodedCreateProduct],
                },
              ],
            }),
          );
          const finalized = yield* decodeRpc(finalizedEnvelope.result);
          expect(finalized.failed).toEqual([]);

          const userId = 'catalog_static_user';
          const authenticatedApi = yield* makeAsync(() =>
            gatewayApi.getAuthenticatedApi({
              publishableKey: 'pk_test',
              authenticationLock,
              signature: { clerkUserId: userId },
            }),
          );
          yield* makeAsync(() => authenticatedApi.getAuthentication()).pipe(
            Effect.flatMap(decodeRpc),
          );
          const frontendApi = yield* makeAsync(() =>
            authenticatedApi.getServiceFrontendApi({
              serviceName: appService.name,
              frontendName: catalogFrontend.frontendName,
              serviceFrontendLock: catalogServiceFrontendLock,
            }),
          );
          const admission = yield* makeAsync(() =>
            frontendApi.getAdmission(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(admission).toMatchObject({
            userId,
            frontendName: catalogFrontend.frontendName,
            serviceFrontendLock: catalogServiceFrontendLock,
            serviceName: appService.name,
          });

          const stateEnvelope = yield* makeAsync(() =>
            frontendApi.getState({
              traceContext: null,
              args: [],
            }),
          );
          const state = yield* decodeRpc(stateEnvelope.result);
          expect(state.resources).toEqual([
            expect.objectContaining({
              id: createProduct.payload.id,
              modelName: 'product',
              name: 'Static catalog product',
            }),
          ]);
          expect(
            yield* makeAsync(() =>
              systemRepo.getRepoRegistrations({
                generationId,
                repoType: 'ServiceFrontendRepo',
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          ).toHaveLength(1);
          expect(
            yield* makeAsync(() =>
              systemRepo.getRepoRegistrations({
                generationId,
                repoType: 'AggregateRepo',
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          ).toEqual([]);
        }).pipe(Effect.scoped),
    );
  });
});
