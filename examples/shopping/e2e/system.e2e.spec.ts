import { expect, test } from '@playwright/test';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { system } from '@/zerospin/system';

test('standalone static system api exposes its spec and direct repos', async () => {
  test.setTimeout(120_000);

  const apiUrl = process.env.ZEROSPIN_API_URL;
  if (!apiUrl) {
    throw new Error('Set ZEROSPIN_API_URL for shopping e2e.');
  }

  const zerospinSecretKey = process.env.ZEROSPIN_SECRET_KEY;
  if (!zerospinSecretKey) {
    throw new Error('Set ZEROSPIN_SECRET_KEY for shopping e2e.');
  }

  await expect(async () => {
    using systemSpecGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const systemSpecApi = systemSpecGatewayApi.getSystemApi({
      zerospinSecretKey,
    });

    const systemSpecEnvelope = await systemSpecApi.makeSystemSpec({
      traceContext: null,
      args: [],
    });
    const systemSpec = await Effect.runPromise(
      decodeRpc(systemSpecEnvelope.result),
    );

    expect(systemSpec.systemName).toBe(system.name);
    expect(systemSpec.version).toBe(system.version);
    expect(systemSpecEnvelope.link).toBeNull();

    using serviceQueryGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const serviceQueryEnvelope = await serviceQueryGatewayApi
      .getSystemApi({ zerospinSecretKey })
      .executeServiceQuery({
        traceContext: null,
        args: [
          {
            serviceName: 'app',
            queryName: 'getProducts',
            params: {},
          },
        ],
      });
    const serviceQueryResult = await Effect.runPromise(
      decodeRpc(serviceQueryEnvelope.result),
    );

    expect(serviceQueryResult).toEqual([]);

  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });
});
