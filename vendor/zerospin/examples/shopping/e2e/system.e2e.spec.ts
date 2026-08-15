import { expect, test } from '@playwright/test';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableApiTarget,
} from '@zerospin/logger';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { system } from '@/zerospin/system';

test('standalone system api exposes its spec and app service query', async () => {
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
    const telemetryCollector = makeTelemetryCollector();

    // 1 — preserve the deployed-system contract assertion without adding a
    // third caller link to the two-operation cross-store proof below.
    using gatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const systemSpecApi = gatewayApi.getSystemApi({ zerospinSecretKey });
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

    // 2 — execute one read through the concrete traced SystemApi client.
    using serviceQueryGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const serviceQuerySystemApi = makeTraceableApiTarget(
      serviceQueryGatewayApi.getSystemApi({ zerospinSecretKey }),
    );
    const productRows = await Effect.runPromise(
      serviceQuerySystemApi
        .executeServiceQuery({
          serviceName: 'app',
          queryName: 'getProducts',
          params: {},
        })
        .pipe(
          Effect.withSpan('shopping.system.executeServiceQuery', {
            root: true,
          }),
          Effect.provide(makeTelemetryLayer(telemetryCollector)),
        ),
    );

    expect(productRows).toEqual(expect.any(Array));

    // 3 — execute the mutation leaf with no commands. ServiceRepo rejects the
    // request before changing domain state. The current-write route enters
    // SystemRepo directly and therefore returns no generation-owned telemetry
    // link.
    using serviceFinalizationGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const serviceFinalizationSystemApi = makeTraceableApiTarget(
      serviceFinalizationGatewayApi.getSystemApi({ zerospinSecretKey }),
    );
    const mutationResult = await Effect.runPromise(
      serviceFinalizationSystemApi
        .finalizeServiceCommands({
          serviceName: 'app',
          commands: [],
        })
        .pipe(
          Effect.either,
          Effect.withSpan('shopping.system.finalizeServiceCommands', {
            root: true,
          }),
          Effect.provide(makeTelemetryLayer(telemetryCollector)),
        ),
    );

    expect(mutationResult).toEqual(
      expect.objectContaining({
        _tag: 'Left',
        left: expect.objectContaining({ code: 'no-commands-provided' }),
      }),
    );

    // 4 — retain the two local caller roots and the read route's server-owned
    // link before making the raw RepoExplorer calls used to inspect
    // SystemLogRepo.
    const callerBatch = telemetryCollector.flush();
    expect(callerBatch.spans).toHaveLength(2);
    expect(callerBatch.links).toHaveLength(1);

    const readCallerRoot = callerBatch.spans[0];
    if (readCallerRoot === undefined) {
      throw new Error('Expected the service-query caller root');
    }
    const mutationCallerRoot = callerBatch.spans[1];
    if (mutationCallerRoot === undefined) {
      throw new Error('Expected the service-finalization caller root');
    }
    const readLink = callerBatch.links[0];
    if (readLink === undefined) {
      throw new Error('Expected the service-query causedBy link');
    }

    expect(readCallerRoot.name).toBe('shopping.system.executeServiceQuery');
    expect(readCallerRoot.parentSpanId).toBeNull();
    expect(mutationCallerRoot.name).toBe(
      'shopping.system.finalizeServiceCommands',
    );
    expect(mutationCallerRoot.parentSpanId).toBeNull();
    expect(readLink).toEqual(
      expect.objectContaining({
        priorTraceId: readCallerRoot.traceId,
        priorSpanId: readCallerRoot.spanId,
        kind: 'causedBy',
      }),
    );

    // 5 — use the raw linked-envelope surface for RepoExplorer so these
    // administrative reads do not add links to the caller batch under proof.
    using systemLogRepoGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const systemLogRepoSystemApi = systemLogRepoGatewayApi.getSystemApi({
      zerospinSecretKey,
    });
    const systemLogRepoRegistrationsEnvelope =
      await systemLogRepoSystemApi.getSystemLogRepos({
        traceContext: null,
        args: [],
      });
    const systemLogRepoRegistrations = await Effect.runPromise(
      decodeRpc(systemLogRepoRegistrationsEnvelope.result),
    );

    expect(systemLogRepoRegistrationsEnvelope.link).toBeNull();
    expect(systemLogRepoRegistrations).toHaveLength(1);
    const systemLogRepoRegistration = systemLogRepoRegistrations[0];
    if (systemLogRepoRegistration === undefined) {
      throw new Error('Expected one SystemLogRepo registration');
    }
    expect(systemLogRepoRegistration.repoType).toBe('SystemLogRepo');
    expect(systemLogRepoRegistration.tableNames).toContain('telemetrySpans');

    using telemetrySpansGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
    const telemetrySpansSystemApi = telemetrySpansGatewayApi.getSystemApi({
      zerospinSecretKey,
    });
    const telemetrySpansEnvelope =
      await telemetrySpansSystemApi.getSystemLogRepoTableRows({
        traceContext: null,
        args: [
          {
            repoName: systemLogRepoRegistration.repoName,
            tableName: 'telemetrySpans',
          },
        ],
      });
    const telemetrySpans = await Effect.runPromise(
      decodeRpc(telemetrySpansEnvelope.result),
    );

    expect(telemetrySpansEnvelope.link).toBeNull();
    expect(telemetrySpans.rows).toContainEqual(
      expect.objectContaining({
        traceId: readLink.traceId,
        spanId: readLink.spanId,
        name: 'SystemApi.executeServiceQuery',
        parentSpanId: null,
      }),
    );
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });
});
