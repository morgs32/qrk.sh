import { describe, expect, it } from 'vitest';

import { renderTraceDag } from './renderTraceDag.ts';
import type { ITelemetryBatch } from './types.ts';

describe('renderTraceDag', () => {
  it('renders nested traces, logs, causal links, and unresolved links', () => {
    const batch: ITelemetryBatch = {
      spans: [
        {
          spanId: 'spn_child',
          traceId: 'trc_origin',
          parentSpanId: 'spn_root',
          name: 'AccountRepo.finalizeAccountBlock',
          status: 'error',
          startedAt: 2,
          endedAt: 3,
          attributes: { ignored: 'volatile' },
        },
        {
          spanId: 'spn_root',
          traceId: 'trc_origin',
          parentSpanId: null,
          name: 'SystemApi.finalizeAccountCommands',
          status: 'ok',
          startedAt: 1,
          endedAt: 4,
          attributes: null,
        },
        {
          spanId: 'spn_orphan',
          traceId: 'trc_origin',
          parentSpanId: 'spn_missing',
          name: 'SystemWorker.finalizeAccountBlock',
          status: 'lost',
          startedAt: 1,
          endedAt: 1,
          attributes: null,
        },
        {
          spanId: 'spn_drain',
          traceId: 'trc_drain',
          parentSpanId: null,
          name: 'AccountBlockRepo.drainActorOutbox',
          status: 'ok',
          startedAt: 5,
          endedAt: 6,
          attributes: null,
        },
        {
          spanId: 'spn_alarm',
          traceId: 'trc_alarm',
          parentSpanId: null,
          name: 'AccountBlockRepo.alarm',
          status: 'ok',
          startedAt: 7,
          endedAt: 8,
          attributes: null,
        },
      ],
      logs: [
        {
          logId: 'lgr_warning',
          createdAt: 2,
          level: 'warn',
          message: 'retry scheduled for 500ms',
          source: 'AccountRepo.finalizeAccountBlock',
          payload: { ignored: true },
          traceId: 'trc_origin',
          spanId: 'spn_child',
        },
      ],
      links: [
        {
          linkId: 'lnk_drain',
          traceId: 'trc_drain',
          spanId: 'spn_drain',
          priorTraceId: 'trc_origin',
          priorSpanId: 'spn_child',
          kind: 'causedBy',
        },
        {
          linkId: 'lnk_alarm',
          traceId: 'trc_alarm',
          spanId: 'spn_alarm',
          priorTraceId: 'trc_drain',
          priorSpanId: 'spn_external',
          kind: 'retryOf',
        },
      ],
    };

    expect(renderTraceDag(batch)).toMatchInlineSnapshot(`
      "trace T1
      ├─ T1.1 SystemApi.finalizeAccountCommands [ok]
      │  └─ T1.2 AccountRepo.finalizeAccountBlock [error]
      │     └· [warn] retry scheduled for 500ms
      └─ T1.3 SystemWorker.finalizeAccountBlock [lost]

      trace T2
      └─ T2.1 AccountBlockRepo.drainActorOutbox [ok]

      trace T3
      └─ T3.1 AccountBlockRepo.alarm [ok]

      links
      ├─ T1.2 AccountRepo.finalizeAccountBlock [error] ─causedBy→ T2.1 AccountBlockRepo.drainActorOutbox [ok]
      └─ external ─retryOf→ T3.1 AccountBlockRepo.alarm [ok]"
    `);
  });

  it('renders an empty batch', () => {
    expect(
      renderTraceDag({ spans: [], logs: [], links: [] }),
    ).toMatchInlineSnapshot(`"(empty trace DAG)"`);
  });
});
