import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
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
import { system } from '@/zerospin/system';

const TestLayer = makeWorkerdE2eTestLayer('telemetryWorkflow');

describe('public SystemApi telemetry boundary', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'returns the current index-based aggregate finalization receipt',
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
          const aggregateId = makeAggregateId({ id: 'telemetry' });
          const command = yield* system.aggregates.shopper.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: User.prefixId('user_telemetry'),
              clerkUserId: 'user_telemetry',
            },
          });
          const encodedCommand = {
            ...command,
            payload:
              yield* system.aggregates.shopper.contracts.createUser.encodePayload(
                { payload: command.payload },
              ),
          };

          const finalized = yield* makeAsync(() =>
            systemApi.finalizeAggregateCommand({
              traceContext: null,
              args: [encodedCommand],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(finalized).toMatchObject({
            aggregateIndex: 1,
            id: command.id,
            failedAt: null,
            failure: null,
          });
        }).pipe(Effect.provide(AsyncLive), Effect.scoped),
      120_000,
    );
  });
});
