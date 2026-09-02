import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newWebSocketRpcSession } from 'capnweb';
import { reset, SELF } from 'cloudflare:test';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(async () => {
  await reset();
});

describe('DevWorker static Gateway', () => {
  it('serves SystemApi immediately without deployment activation', async () => {
    const response = await SELF.fetch(
      new Request('https://dev-worker.test/rpc', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(response.status).toBe(101);
    response.webSocket!.accept();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(response.webSocket!);
    using systemApi = await gatewayApi.getSystemApi({
      zerospinSecretKey: 'sk_dev_test',
    });

    const healthcheck = await systemApi.healthcheck({
      args: [],
      traceContext: null,
    });
    expect(await Effect.runPromise(decodeRpc(healthcheck.result))).toBe(
      'healthy',
    );
  });
});
