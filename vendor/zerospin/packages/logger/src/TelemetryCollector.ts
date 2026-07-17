import { Context } from 'effect';

import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
  ITelemetryBatch,
} from './types.ts';

export type ITelemetryCollector = {
  addSpan: (span: ISpanRecord) => void;
  addLog: (log: ILogRecord) => void;
  addLinks: (links: readonly ISpanLinkRecord[]) => void;
  merge: (batch: ITelemetryBatch) => void;
  flush: () => ITelemetryBatch;
};

export class TelemetryCollector extends Context.Tag('TelemetryCollector')<
  TelemetryCollector,
  ITelemetryCollector
>() {}

export const makeTelemetryCollector = (): ITelemetryCollector => {
  let spans: ISpanRecord[] = [];
  let logs: ILogRecord[] = [];
  let links: ISpanLinkRecord[] = [];

  return {
    addSpan: span => {
      spans.push(span);
    },
    addLog: log => {
      logs.push(log);
    },
    addLinks: newLinks => {
      links.push(...newLinks);
    },
    merge: batch => {
      spans.push(...batch.spans);
      logs.push(...batch.logs);
      links.push(...batch.links);
    },
    flush: () => {
      const batch: ITelemetryBatch = { spans, logs, links };
      spans = [];
      logs = [];
      links = [];
      return batch;
    },
  };
};
