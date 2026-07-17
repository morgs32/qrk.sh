/*
 * Renders completed telemetry as stable snapshot text. Runtime identifiers and
 * timestamps are deliberately replaced by traversal addresses so two
 * equivalent traces produce the same Vitest snapshot.
 */

import type {
  ILogRecord,
  ISpanId,
  ISpanRecord,
  ITelemetryBatch,
  ITraceId,
} from './types.ts';

export const renderTraceDag = (batch: ITelemetryBatch): string => {
  if (batch.spans.length === 0) {
    return '(empty trace DAG)';
  }

  /*
   * 1. Preserve first-seen trace/span order as the deterministic tie-breaker
   * when multiple records share the same epoch-millisecond start time.
   */
  const traceIds: ITraceId[] = [];
  const seenTraceIds = new Set<ITraceId>();
  const spanOrder = new Map<ISpanId, number>();
  const spanById = new Map<ISpanId, ISpanRecord>();
  for (let spanIndex = 0; spanIndex < batch.spans.length; spanIndex += 1) {
    const span = batch.spans[spanIndex];
    if (span === undefined) {
      continue;
    }
    spanOrder.set(span.spanId, spanIndex);
    spanById.set(span.spanId, span);
    if (!seenTraceIds.has(span.traceId)) {
      seenTraceIds.add(span.traceId);
      traceIds.push(span.traceId);
    }
  }

  /*
   * 2. Build the parent adjacency list and attach logs to their owning spans.
   * A missing parent remains a root instead of disappearing from the output.
   */
  const childrenByParentSpanId = new Map<ISpanId, ISpanRecord[]>();
  const rootsByTraceId = new Map<ITraceId, ISpanRecord[]>();
  for (const span of batch.spans) {
    const parent =
      span.parentSpanId === null ? undefined : spanById.get(span.parentSpanId);
    if (parent === undefined || parent.traceId !== span.traceId) {
      const roots = rootsByTraceId.get(span.traceId) ?? [];
      roots.push(span);
      rootsByTraceId.set(span.traceId, roots);
      continue;
    }
    const children = childrenByParentSpanId.get(parent.spanId) ?? [];
    children.push(span);
    childrenByParentSpanId.set(parent.spanId, children);
  }

  const logsBySpanId = new Map<ISpanId, ILogRecord[]>();
  for (const log of batch.logs) {
    if (log.spanId === null || !spanById.has(log.spanId)) {
      continue;
    }
    const logs = logsBySpanId.get(log.spanId) ?? [];
    logs.push(log);
    logsBySpanId.set(log.spanId, logs);
  }

  /*
   * 3. Render each trace as a tree while assigning Tn.m addresses. Those same
   * addresses are reused by the causal edge section below.
   */
  const lines: string[] = [];
  const addressBySpanId = new Map<ISpanId, string>();
  const visitedSpanIds = new Set<ISpanId>();

  const renderSpan = (props: {
    span: ISpanRecord;
    traceNumber: number;
    prefix: string;
    isLast: boolean;
  }): void => {
    const { span, traceNumber, prefix, isLast } = props;
    if (visitedSpanIds.has(span.spanId)) {
      return;
    }
    visitedSpanIds.add(span.spanId);

    let traceSpanNumber = 0;
    for (const address of addressBySpanId.values()) {
      if (address.startsWith(`T${traceNumber}.`)) {
        traceSpanNumber += 1;
      }
    }
    const address = `T${traceNumber}.${traceSpanNumber + 1}`;
    addressBySpanId.set(span.spanId, address);

    lines.push(
      `${prefix}${isLast ? '└─' : '├─'} ${address} ${span.name} [${span.status}]`,
    );

    const childPrefix = `${prefix}${isLast ? '   ' : '│  '}`;
    const logs = (logsBySpanId.get(span.spanId) ?? []).toSorted(
      (left, right) => left.createdAt - right.createdAt,
    );
    const children = (childrenByParentSpanId.get(span.spanId) ?? []).toSorted(
      (left, right) => {
        const startedAtOrder = left.startedAt - right.startedAt;
        if (startedAtOrder !== 0) {
          return startedAtOrder;
        }
        return (
          (spanOrder.get(left.spanId) ?? 0) - (spanOrder.get(right.spanId) ?? 0)
        );
      },
    );

    for (let logIndex = 0; logIndex < logs.length; logIndex += 1) {
      const log = logs[logIndex];
      if (log === undefined) {
        continue;
      }
      const logIsLast = logIndex === logs.length - 1 && children.length === 0;
      lines.push(
        `${childPrefix}${logIsLast ? '└·' : '├·'} [${log.level}] ${log.message}`,
      );
    }

    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      if (child === undefined) {
        continue;
      }
      renderSpan({
        span: child,
        traceNumber,
        prefix: childPrefix,
        isLast: childIndex === children.length - 1,
      });
    }
  };

  for (let traceIndex = 0; traceIndex < traceIds.length; traceIndex += 1) {
    const traceId = traceIds[traceIndex];
    if (traceId === undefined) {
      continue;
    }
    if (lines.length > 0) {
      lines.push('');
    }
    const traceNumber = traceIndex + 1;
    lines.push(`trace T${traceNumber}`);

    const roots = (rootsByTraceId.get(traceId) ?? []).toSorted(
      (left, right) => {
        const startedAtOrder = left.startedAt - right.startedAt;
        if (startedAtOrder !== 0) {
          return startedAtOrder;
        }
        return (
          (spanOrder.get(left.spanId) ?? 0) - (spanOrder.get(right.spanId) ?? 0)
        );
      },
    );
    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      const root = roots[rootIndex];
      if (root === undefined) {
        continue;
      }
      renderSpan({
        span: root,
        traceNumber,
        prefix: '',
        isLast: rootIndex === roots.length - 1,
      });
    }
  }

  /*
   * 4. Span links point backward on the wire, so print them in forward causal
   * order: prior span first, linked/current span second.
   */
  lines.push('', 'links');
  if (batch.links.length === 0) {
    lines.push('└─ (none)');
    return lines.join('\n');
  }

  for (let linkIndex = 0; linkIndex < batch.links.length; linkIndex += 1) {
    const link = batch.links[linkIndex];
    if (link === undefined) {
      continue;
    }
    const priorSpan = spanById.get(link.priorSpanId);
    const currentSpan = spanById.get(link.spanId);
    const priorAddress = addressBySpanId.get(link.priorSpanId);
    const currentAddress = addressBySpanId.get(link.spanId);
    const priorLabel =
      priorSpan === undefined || priorAddress === undefined
        ? 'external'
        : `${priorAddress} ${priorSpan.name} [${priorSpan.status}]`;
    const currentLabel =
      currentSpan === undefined || currentAddress === undefined
        ? 'external'
        : `${currentAddress} ${currentSpan.name} [${currentSpan.status}]`;
    lines.push(
      `${linkIndex === batch.links.length - 1 ? '└─' : '├─'} ${priorLabel} ─${link.kind}→ ${currentLabel}`,
    );
  }

  return lines.join('\n');
};
