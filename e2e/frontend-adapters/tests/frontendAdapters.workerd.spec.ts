import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { newWebSocketRpcSession } from 'capnweb';
import { env, SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import { expect } from 'vitest';

import { SourceItem } from '../src/domain';
import { projection } from '../src/projection';
import { authenticationSignature, system } from '../src/system';

const E2E_AGGREGATE_ID = makeAggregateId({ id: '1' });
const E2E_CLERK_USER_ID = 'uid_frontend_adapters_workerd_user';
const aggregateFrontendLock =
  makeFrontendControllerSpec(projection).aggregateFrontendLock;

const TestLayer = makeWorkerdE2eTestLayer('frontendAdapters');

describe('frontendAdapters: static aggregate finalization', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'executes authored aggregate contracts and serves aggregate frontend leaves',
      () =>
        Effect.gen(function* () {
          const itemId = yield* SourceItem.makeId();
          const createItem = yield* system.aggregates.aggregate[
            '1.0.0'
          ]!.makeCommand({
            contractName: 'createSourceItem',
            aggregateId: E2E_AGGREGATE_ID,
            systemName: projection.systemName,
            payload: {
              id: itemId,
              userId: E2E_CLERK_USER_ID,
              quantity: 2,
            },
          });
          const encodedCreateItem = {
            ...createItem,
            payload: yield* system.aggregates.aggregate[
              '1.0.0'
            ]!.contracts.createSourceItem.contract.encodePayload({
              version: createItem.contractVersion,
              payload: createItem.payload,
            }),
          };

          const gatewayApi = yield* Effect.acquireRelease(
            makeAsync(async () => {
              const response = await SELF.fetch(
                new globalThis.Request('https://frontend-adapters.test/rpc', {
                  headers: { Upgrade: 'websocket' },
                }),
              );
              if (response.webSocket === null) {
                throw new Error(
                  'Frontend adapters Worker did not return a WebSocket',
                );
              }
              response.webSocket.accept();
              return newWebSocketRpcSession<GatewayApi>(response.webSocket);
            }),
            gateway => Effect.sync(() => gateway[Symbol.dispose]()),
          );
          const finalizedEnvelope = yield* makeAsync(async () => {
            using systemApi = await gatewayApi.getSystemApi({
              zerospinSecretKey: 'sk_test_system_runtime_capability',
            });
            return systemApi.executeAggregateCommand({
              traceContext: null,
              args: [{ aggregateVersion: '1.0.0', command: encodedCreateItem }],
            });
          });
          const finalized = yield* decodeRpc(finalizedEnvelope.result);
          expect(finalized).toEqual(
            expect.objectContaining({
              id: encodedCreateItem.id,
              delta: expect.any(Object),
              failedAt: null,
              failure: null,
            }),
          );
          expect(finalized.aggregateIndex).toBe(1);

          const authenticationLock = makeAuthenticationLock(
            authenticationSignature,
          );
          const frontendResults = yield* makeAsync(async () => {
            using frontendApi = await gatewayApi.getAggregateFrontendApi({
              aggregateVersion: '1.0.0',
              publishableKey: 'pk_test',
              systemName: system.name,
              authenticationLock,
              signature: { clerkUserId: E2E_CLERK_USER_ID },
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: projection.aggregateName,
              frontendName: projection.name,
              aggregateFrontendLock,
            });
            return {
              state: await frontendApi.getState({
                traceContext: null,
                args: [{ outstandingCommandIds: [] }],
              }),
              ticket: await frontendApi.createWebSocketTicket({
                traceContext: null,
                args: [{ aggregateVersion: '1.0.0' }],
              }),
            };
          });

          const state = yield* decodeRpc(frontendResults.state.result);
          expect(state).toMatchObject({
            aggregateId: E2E_AGGREGATE_ID,
            userId: E2E_CLERK_USER_ID,
          });

          const ticket = yield* decodeRpc(frontendResults.ticket.result);
          expect(ticket.ticket).toHaveLength(43);

          const systemRepo = yield* SystemRepo.getRepo({
            key: { systemId: env.ZEROSPIN_SYSTEM_ID },
          });
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
