import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newWebSocketRpcSession } from 'capnweb';
import { reset, SELF } from 'cloudflare:test';
import config from 'config';
import { Effect } from 'effect';
import { products } from 'system-worker/fixtures/system';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { beforeEach, describe, expect, it } from 'vitest';

const { system } = config;

beforeEach(async () => {
  await reset();
});

describe('ProductionWorker static Gateway', () => {
  it('serves SystemApi immediately without deployment activation', async () => {
    const response = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(response.status).toBe(101);
    expect(response.headers.get('X-Zerospin-Worker-Version')).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using systemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_live_production_test',
    });

    const healthcheck = await systemApi.healthcheck({
      args: [],
      traceContext: null,
    });
    expect(await Effect.runPromise(decodeRpc(healthcheck.result))).toBe(
      'healthy',
    );
  });

  it('issues one opaque frontend WebSocket ticket for the exact static Repo', async () => {
    const response = await SELF.fetch(
      new Request('https://production-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using systemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_live_production_test',
    });
    const accepted = await systemApi.checkSystemSpec({
      args: [],
      traceContext: null,
    });
    await Effect.runPromise(decodeRpc(accepted.result));
    using serviceFrontendApi = await gatewayApi
      .service({
        publishableKey: 'pk_live_production_test',
        systemName: system.name,
        name: 'app',
        version: '1.0.0',
      })
      .authenticate({ signature: { userId: 'usr_production_socket' } })
      .authorize({
        frontendName: 'products',
        serviceFrontendLock: makeServiceFrontendLock({
          frontend: products,
        }),
      });
    const snapshotEnvelope = await serviceFrontendApi.getSnapshot({
      args: [],
      traceContext: null,
    });
    await Effect.runPromise(decodeRpc(snapshotEnvelope.result));
    const ticketEnvelope = await serviceFrontendApi.createWebSocketTicket({
      args: [{ serviceVersion: '1.0.0' }],
      traceContext: null,
    });
    const ticket = await Effect.runPromise(decodeRpc(ticketEnvelope.result));

    expect(ticket.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ticket.ticket).not.toContain('.');
    const invalid = await SELF.fetch(
      new Request(
        `https://production-worker.test/ws-service-frontend-commands?ticket=prefixed.${ticket.ticket}`,
        { headers: { Upgrade: 'websocket' } },
      ),
    );
    expect(invalid.status).toBe(400);
  });
});
