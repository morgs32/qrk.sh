import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newWebSocketRpcSession } from 'capnweb';
import { reset, SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import { authenticationSignature, system } from 'system';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { beforeEach, describe, expect, it } from 'vitest';

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
    using serviceFrontendApi = await gatewayApi.getServiceFrontendApi({
      publishableKey: 'pk_live_production_test',
      systemName: system.name,
      authenticationLock: makeAuthenticationLock({
        signature: authenticationSignature,
      }),
      signature: { userId: 'usr_production_socket' },
      frontendName: 'products',
      serviceFrontendLock: makeServiceFrontendLock({
        frontend: system.services.app.frontends.products.controller,
      }),
      serviceName: 'app',
    });
    const stateEnvelope = await serviceFrontendApi.getState({
      args: [],
      traceContext: null,
    });
    await Effect.runPromise(decodeRpc(stateEnvelope.result));
    const ticketEnvelope = await serviceFrontendApi.createWebSocketTicket({
      args: [],
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
