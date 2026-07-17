import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
  ITelemetryBatch,
  ITraceId,
} from './types.ts';

export type ITraceStore = {
  append: (batch: ITelemetryBatch) => void;
  getTrace: (traceId: ITraceId) => ITelemetryBatch;
  /** Forward query: links in other traces that cite this trace as their cause. */
  getCausedBy: (traceId: ITraceId) => readonly ISpanLinkRecord[];
};

export const makeTraceStore = (): ITraceStore => {
  const spans: ISpanRecord[] = [];
  const logs: ILogRecord[] = [];
  const links: ISpanLinkRecord[] = [];

  return {
    append: batch => {
      spans.push(...batch.spans);
      logs.push(...batch.logs);
      links.push(...batch.links);
    },
    getTrace: traceId => ({
      spans: spans
        .filter(span => span.traceId === traceId)
        .toSorted((a, b) => a.startedAt - b.startedAt),
      logs: logs
        .filter(log => log.traceId === traceId)
        .toSorted((a, b) => a.createdAt - b.createdAt),
      links: links.filter(link => link.traceId === traceId),
    }),
    getCausedBy: traceId => links.filter(link => link.priorTraceId === traceId),
  };
};

export type ISpanTreeNode = Readonly<{
  span: ISpanRecord;
  logs: readonly ILogRecord[];
  children: readonly ISpanTreeNode[];
}>;

/** Adjacency-list reconstruction; spans whose parent is missing become roots. */
export const buildTraceTree = (
  batch: ITelemetryBatch,
): readonly ISpanTreeNode[] => {
  const spanIds = new Set(batch.spans.map(span => span.spanId));
  const logsBySpanId = new Map<string, ILogRecord[]>();
  for (const log of batch.logs) {
    if (log.spanId === null) {
      continue;
    }
    const existing = logsBySpanId.get(log.spanId) ?? [];
    existing.push(log);
    logsBySpanId.set(log.spanId, existing);
  }

  const build = (span: ISpanRecord): ISpanTreeNode => ({
    span,
    logs: logsBySpanId.get(span.spanId) ?? [],
    children: batch.spans
      .filter(candidate => candidate.parentSpanId === span.spanId)
      .toSorted((a, b) => a.startedAt - b.startedAt)
      .map(build),
  });

  return batch.spans
    .filter(
      span => span.parentSpanId === null || !spanIds.has(span.parentSpanId),
    )
    .toSorted((a, b) => a.startedAt - b.startedAt)
    .map(build);
};
