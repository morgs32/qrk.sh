import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeRpcHandler } from './makeRpcHandler.ts';
import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import { makeTraceableRpcTarget } from './makeTraceableRpcTarget.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';
import { buildTraceTree, makeTraceStore } from './TraceStore.ts';
import type { ITelemetryBatch } from './types.ts';

const runNestedTrace = async (): Promise<ITelemetryBatch> => {
  const outer = makeRpcHandler('MockRpc.outer')(function* () {
    yield* Effect.logInfo('deep work');
    yield* Effect.void.pipe(Effect.withSpan('MockRpc.inner'));
  });
  const mockRpcTarget = {
    outer: (request: Parameters<typeof outer>[0]) =>
      Effect.runPromise(outer(request)),
  };
  const wrappedMockRpcTarget = makeTraceableRpcTarget(mockRpcTarget);
  const collector = makeTelemetryCollector();

  await Effect.runPromise(
    Effect.gen(function* () {
      return yield* wrappedMockRpcTarget.outer();
    }).pipe(
      Effect.withSpan('LocalOp.root'),
      Effect.provide(makeTelemetryLayer(collector)),
    ),
  );
  return collector.flush();
};

describe('TraceStore', () => {
  it('reconstructs a nested tree from a real two-runtime run', async () => {
    const store = makeTraceStore();
    const batch = await runNestedTrace();
    store.append(batch);

    const traceId = batch.spans[0]!.traceId;
    const tree = buildTraceTree(store.getTrace(traceId));

    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.span.name).toBe('LocalOp.root');
    expect(root.children.map(node => node.span.name)).toEqual([
      'MockRpc.outer',
    ]);
    expect(root.children[0]!.children.map(node => node.span.name)).toEqual([
      'MockRpc.inner',
    ]);
    expect(root.children[0]!.logs.map(log => log.message)).toEqual([
      'deep work',
    ]);
  });

  it('answers forward and backward causal queries via links', () => {
    const store = makeTraceStore();
    store.append({
      spans: [
        {
          spanId: 'spn_api',
          traceId: 'trc_api',
          parentSpanId: null,
          name: 'FrontendApi.push',
          status: 'ok',
          startedAt: 0,
          endedAt: 10,
          attributes: null,
        },
        {
          spanId: 'spn_delivery',
          traceId: 'trc_drain',
          parentSpanId: null,
          name: 'AccountBlockRepo.processSubscriber',
          status: 'ok',
          startedAt: 100,
          endedAt: 110,
          attributes: null,
        },
      ],
      logs: [],
      links: [
        {
          linkId: 'lnk_delivery',
          traceId: 'trc_drain',
          spanId: 'spn_delivery',
          priorTraceId: 'trc_api',
          priorSpanId: 'spn_api',
          kind: 'causedBy',
        },
      ],
    });

    expect(store.getTrace('trc_drain').links[0]!.priorSpanId).toBe('spn_api');
    const downstream = store.getCausedBy('trc_api');
    expect(downstream).toHaveLength(1);
    expect(downstream[0]!.spanId).toBe('spn_delivery');
  });

  it('tolerates orphan spans whose parent is not in the batch', () => {
    const tree = buildTraceTree({
      spans: [
        {
          spanId: 'spn_orphan',
          traceId: 'trc_x',
          parentSpanId: 'spn_gone',
          name: 'orphan',
          status: 'ok',
          startedAt: 0,
          endedAt: 1,
          attributes: null,
        },
      ],
      logs: [],
      links: [],
    });
    expect(tree).toHaveLength(1);
    expect(tree[0]!.span.name).toBe('orphan');
  });
});
