import { expect, test } from '@playwright/test';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableApiTarget,
} from '@zerospin/logger';
import { Effect } from 'effect';

test('standalone system api exposes its spec and app service query', async () => {
  test.setTimeout(120_000);

  const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
  if (!apiUrl) {
    throw new Error('Set NEXT_PUBLIC_ZEROSPIN_API_URL for shopping e2e.');
  }

  const zerospinSecretKey = process.env.ZEROSPIN_SECRET_KEY;
  if (!zerospinSecretKey) {
    throw new Error('Set ZEROSPIN_SECRET_KEY for shopping e2e.');
  }

  await expect(async () => {
    const telemetryCollector = makeTelemetryCollector();

    // 1 — preserve the deployed-system contract assertion without adding a
    // third caller link to the two-operation cross-store proof below.
    using systemSpecApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const systemSpecApi = systemSpecApis.getSystemApi({ zerospinSecretKey });
    const systemSpecEnvelope = await systemSpecApi.makeSystemSpec({
      traceContext: null,
      args: [],
    });
    const systemSpec = await Effect.runPromise(
      decodeRpc(systemSpecEnvelope.result),
    );

    expect(systemSpec.systemName).toBe('shopping');
    expect(systemSpec.version).toBe('1.0.2');
    expect(systemSpecEnvelope.link).toBeNull();

    // 2 — execute one read through the concrete traced SystemApi client.
    using serviceQueryApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const serviceQuerySystemApi = makeTraceableApiTarget(
      serviceQueryApis.getSystemApi({ zerospinSecretKey }),
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
    // request before changing domain state, while SystemApi still persists its
    // completed server root and returns the causal link to this caller root.
    using serviceFinalizationApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const serviceFinalizationSystemApi = makeTraceableApiTarget(
      serviceFinalizationApis.getSystemApi({ zerospinSecretKey }),
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

    // 4 — retain the two local caller roots and the two server-owned links
    // before making the raw RepoExplorer calls used to inspect SystemLogRepo.
    const callerBatch = telemetryCollector.flush();
    expect(callerBatch.spans).toHaveLength(2);
    expect(callerBatch.links).toHaveLength(2);

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
    const mutationLink = callerBatch.links[1];
    if (mutationLink === undefined) {
      throw new Error('Expected the service-finalization causedBy link');
    }

    expect(readCallerRoot.name).toBe(
      'shopping.system.executeServiceQuery',
    );
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
    expect(mutationLink).toEqual(
      expect.objectContaining({
        priorTraceId: mutationCallerRoot.traceId,
        priorSpanId: mutationCallerRoot.spanId,
        kind: 'causedBy',
      }),
    );

    // 5 — use the raw linked-envelope surface for RepoExplorer so these
    // administrative reads do not add links to the caller batch under proof.
    using systemLogRepoApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const systemLogRepoSystemApi = systemLogRepoApis.getSystemApi({
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

    using telemetrySpansApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const telemetrySpansSystemApi = telemetrySpansApis.getSystemApi({
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
    expect(telemetrySpans.rows).toContainEqual(
      expect.objectContaining({
        traceId: mutationLink.traceId,
        spanId: mutationLink.spanId,
        name: 'SystemApi.finalizeServiceCommands',
        parentSpanId: null,
      }),
    );
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });
});
