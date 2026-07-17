import { describe, expect, it } from 'vitest';

import {
  makeLogId,
  makeSpanId,
  makeSpanLinkId,
  makeTraceId,
} from './makeTelemetryIds.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';
import {
  emptyTelemetryBatch,
  type ILogRecord,
  type ISpanRecord,
} from './types.ts';

const spanRecord: ISpanRecord = {
  spanId: 'spn_a1',
  traceId: 'trc_a1',
  parentSpanId: null,
  name: 'test.span',
  status: 'ok',
  startedAt: 1000,
  endedAt: 2000,
  attributes: null,
};

const logRecord: ILogRecord = {
  logId: 'lgr_a1',
  createdAt: 1500,
  level: 'info',
  message: 'hello',
  source: 'test.span',
  payload: null,
  traceId: 'trc_a1',
  spanId: 'spn_a1',
};

describe('TelemetryCollector', () => {
  it('collects spans, logs, and links and flushes them once', () => {
    const collector = makeTelemetryCollector();
    collector.addSpan(spanRecord);
    collector.addLog(logRecord);
    collector.addLinks([
      {
        linkId: 'lnk_a1',
        traceId: 'trc_a1',
        spanId: 'spn_a1',
        priorTraceId: 'trc_prior',
        priorSpanId: 'spn_prior',
        kind: 'causedBy',
      },
    ]);

    const batch = collector.flush();
    expect(batch.spans).toEqual([spanRecord]);
    expect(batch.logs).toEqual([logRecord]);
    expect(batch.links).toHaveLength(1);
    expect(collector.flush()).toEqual(emptyTelemetryBatch());
  });

  it('merges a child batch', () => {
    const collector = makeTelemetryCollector();
    collector.merge({ spans: [spanRecord], logs: [logRecord], links: [] });
    const batch = collector.flush();
    expect(batch.spans).toHaveLength(1);
    expect(batch.logs).toHaveLength(1);
  });

  it('makes prefixed unique ids', () => {
    expect(makeTraceId()).toMatch(/^trc_[0-9a-f]{32}$/);
    expect(makeSpanId()).toMatch(/^spn_[0-9a-f]{16}$/);
    expect(makeLogId()).toMatch(/^lgr_[0-9a-f]{16}$/);
    expect(makeSpanLinkId()).toMatch(/^lnk_[0-9a-f]{16}$/);
    expect(makeSpanId()).not.toEqual(makeSpanId());
  });
});
