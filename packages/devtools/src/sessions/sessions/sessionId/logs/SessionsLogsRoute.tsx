import { useEffect, useState } from "react";

import {
  buildTraceTree,
  emptyTelemetryBatch,
  type ILogRecord,
  type ISpanId,
  type ISpanLinkRecord,
  type ISpanRecord,
  type ITraceId,
} from "@zerospin/logger";
import { useSearchParams } from "react-router";
import { useStore } from "zustand/react";

import { useSessionOrThrow } from "../useSession";

import { SessionsLogsSpanNode } from "./SessionsLogsSpanNode";

export function SessionsLogsRoute() {
  const session = useSessionOrThrow();
  const telemetry = useStore(session.store, (state) => state.telemetry);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTraceId = searchParams.get("traceId");
  const [selectedSpanId, setSelectedSpanId] = useState<ISpanId | null>(null);

  const spansByTraceId = new Map<ITraceId, ISpanRecord[]>();
  const logsByTraceId = new Map<ITraceId, ILogRecord[]>();
  const linksByPriorTraceId = new Map<ITraceId, ISpanLinkRecord[]>();
  const traceIds = new Set<ITraceId>();
  const unscopedLogs: ILogRecord[] = [];

  // 1 — Every local span establishes a browser trace and keeps input order
  // within its trace until buildTraceTree applies execution-time ordering.
  for (const span of telemetry.spans) {
    const traceSpans = spansByTraceId.get(span.traceId) ?? [];
    traceSpans.push(span);
    spansByTraceId.set(span.traceId, traceSpans);
    traceIds.add(span.traceId);
  }

  // 2 — Scoped logs join their browser trace. Null-trace logs deliberately
  // remain visible in the separate Unscoped section.
  for (const log of telemetry.logs) {
    if (log.traceId === null) {
      unscopedLogs.push(log);
      continue;
    }

    const traceLogs = logsByTraceId.get(log.traceId) ?? [];
    traceLogs.push(log);
    logsByTraceId.set(log.traceId, traceLogs);
    traceIds.add(log.traceId);
  }

  // 3 — A boundary link belongs to the browser trace named by priorTraceId.
  // The server trace remains an external destination and is never fabricated
  // as a local span tree.
  for (const link of telemetry.links) {
    const traceLinks = linksByPriorTraceId.get(link.priorTraceId) ?? [];
    traceLinks.push(link);
    linksByPriorTraceId.set(link.priorTraceId, traceLinks);
    traceIds.add(link.priorTraceId);
  }

  const traceRows: Array<
    Readonly<{ traceId: ITraceId; timestamp: number | null }>
  > = [];
  let requestedExistingTraceId: ITraceId | null = null;

  // 4 — Trace ordering uses the earliest local span start. Only traces with
  // no local spans fall back to their earliest associated log timestamp.
  for (const traceId of traceIds) {
    const traceSpans = spansByTraceId.get(traceId) ?? [];
    const traceLogs = logsByTraceId.get(traceId) ?? [];
    let timestamp: number | null = null;

    if (traceId === requestedTraceId) {
      requestedExistingTraceId = traceId;
    }

    for (const span of traceSpans) {
      if (timestamp === null || span.startedAt < timestamp) {
        timestamp = span.startedAt;
      }
    }

    if (traceSpans.length === 0) {
      for (const log of traceLogs) {
        if (timestamp === null || log.createdAt < timestamp) {
          timestamp = log.createdAt;
        }
      }
    }

    traceRows.push({ traceId, timestamp });
  }

  const sortedTraceRows = traceRows.toSorted((left, right) => {
    if (left.timestamp === null && right.timestamp === null) {
      return left.traceId.localeCompare(right.traceId);
    }
    if (left.timestamp === null) {
      return 1;
    }
    if (right.timestamp === null) {
      return -1;
    }
    return right.timestamp - left.timestamp;
  });

  const displayedTraceId =
    requestedExistingTraceId !== null
      ? requestedExistingTraceId
      : (sortedTraceRows[0]?.traceId ?? null);

  const selectedSpans =
    displayedTraceId === null
      ? []
      : (spansByTraceId.get(displayedTraceId) ?? []);
  const selectedLogs =
    displayedTraceId === null
      ? []
      : (logsByTraceId.get(displayedTraceId) ?? []).toSorted(
          (left, right) => left.createdAt - right.createdAt,
        );
  const selectedLinks =
    displayedTraceId === null
      ? []
      : (linksByPriorTraceId.get(displayedTraceId) ?? []);
  const selectedSpansById = new Map<ISpanId, ISpanRecord>();
  const attachedLogs: ILogRecord[] = [];
  const unattachedLogs: ILogRecord[] = [];
  const attachedLogsBySpanId = new Map<ISpanId, ILogRecord[]>();
  const linksByPriorSpanId = new Map<ISpanId, ISpanLinkRecord[]>();
  const unattachedLinks: ISpanLinkRecord[] = [];
  let traceStartedAt: number | null = null;
  let traceEndedAt: number | null = null;

  // 5 — One pass records every local span identity and establishes the full
  // trace timing range. The same lookup later resolves the selected details
  // without scanning the trace a second time.
  for (const span of selectedSpans) {
    selectedSpansById.set(span.spanId, span);
    if (traceStartedAt === null || span.startedAt < traceStartedAt) {
      traceStartedAt = span.startedAt;
    }
    if (traceEndedAt === null || span.endedAt > traceEndedAt) {
      traceEndedAt = span.endedAt;
    }
  }

  // 6 — Logs with a missing/null span identity are kept under Unattached;
  // matching logs are passed to buildTraceTree in createdAt order and indexed
  // for the selected-span details pane during this same attachment pass.
  for (const log of selectedLogs) {
    if (log.spanId === null || !selectedSpansById.has(log.spanId)) {
      unattachedLogs.push(log);
      continue;
    }
    attachedLogs.push(log);
    const spanLogs = attachedLogsBySpanId.get(log.spanId) ?? [];
    spanLogs.push(log);
    attachedLogsBySpanId.set(log.spanId, spanLogs);
  }

  // 7 — Links attach only through the browser-side priorSpanId. A missing
  // browser span is diagnostic data, so it remains visible under Unattached.
  for (const link of selectedLinks) {
    if (!selectedSpansById.has(link.priorSpanId)) {
      unattachedLinks.push(link);
      continue;
    }

    const spanLinks = linksByPriorSpanId.get(link.priorSpanId) ?? [];
    spanLinks.push(link);
    linksByPriorSpanId.set(link.priorSpanId, spanLinks);
  }

  const traceTree = buildTraceTree({
    spans: selectedSpans,
    logs: attachedLogs,
    links: selectedLinks,
  });
  const displayedSpanId =
    selectedSpanId !== null && selectedSpansById.has(selectedSpanId)
      ? selectedSpanId
      : (traceTree[0]?.span.spanId ?? null);

  useEffect(() => {
    if (displayedSpanId !== selectedSpanId) {
      setSelectedSpanId(displayedSpanId);
    }
  }, [displayedSpanId, selectedSpanId]);

  const displayedSpan =
    displayedSpanId === null
      ? null
      : (selectedSpansById.get(displayedSpanId) ?? null);
  const displayedSpanLogs =
    displayedSpanId === null
      ? []
      : (attachedLogsBySpanId.get(displayedSpanId) ?? []);
  const displayedSpanLinks =
    displayedSpanId === null
      ? []
      : (linksByPriorSpanId.get(displayedSpanId) ?? []);
  const displayedTraceStartedAt = traceStartedAt ?? 0;
  const displayedTraceDuration = Math.max(
    (traceEndedAt ?? displayedTraceStartedAt) - displayedTraceStartedAt,
    1,
  );
  const sortedUnscopedLogs = unscopedLogs.toSorted(
    (left, right) => left.createdAt - right.createdAt,
  );

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        backgroundColor: "#ffffff",
      }}
    >
      <aside
        aria-label="Browser traces"
        style={{
          display: "flex",
          flexDirection: "column",
          width: 300,
          minWidth: 220,
          borderRight: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px 10px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <strong style={{ color: "#111827", fontSize: 12 }}>
            Traces ({sortedTraceRows.length})
          </strong>
          <button
            type="button"
            data-testid="clear-session-telemetry"
            onClick={() => {
              session.store.setState({
                telemetry: emptyTelemetryBatch(),
                lastDevtoolsPush: null,
              });
              setSearchParams({});
            }}
            style={{
              padding: "3px 7px",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              backgroundColor: "#ffffff",
              color: "#374151",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 10,
            }}
          >
            Clear
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {sortedTraceRows.length === 0 ? (
            <div style={{ padding: 12, color: "#6b7280", fontSize: 11 }}>
              No scoped traces.
            </div>
          ) : (
            sortedTraceRows.map((row) => (
              <button
                key={row.traceId}
                type="button"
                data-testid={`trace-list-item-${row.traceId}`}
                aria-pressed={displayedTraceId === row.traceId}
                onClick={() => {
                  setSearchParams({ traceId: row.traceId });
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  borderBottom: "1px solid #e5e7eb",
                  backgroundColor:
                    displayedTraceId === row.traceId ? "#dbeafe" : "transparent",
                  color: "#111827",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <code style={{ fontSize: 10 }}>{row.traceId}</code>
                <span style={{ color: "#6b7280", fontSize: 10 }}>
                  {row.timestamp === null
                    ? "No local timing"
                    : new Date(row.timestamp).toISOString()}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <main
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {displayedTraceId === null ? (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "auto",
              padding: 12,
            }}
          >
            <div style={{ color: "#6b7280", fontSize: 12 }}>
              No scoped trace selected.
            </div>

            {sortedUnscopedLogs.length === 0 ? null : (
              <section data-testid="unscoped-logs" style={{ marginTop: 14 }}>
                <h3
                  style={{
                    margin: "0 0 6px",
                    color: "#111827",
                    fontSize: 12,
                  }}
                >
                  Unscoped
                </h3>
                {sortedUnscopedLogs.map((log) => (
                  <pre
                    key={log.logId}
                    data-testid={`unscoped-log-${log.logId}`}
                    style={{
                      margin: "6px 0 0",
                      padding: 8,
                      overflow: "auto",
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      backgroundColor: "#f9fafb",
                      color: "#374151",
                      fontSize: 10,
                    }}
                  >
                    {JSON.stringify(log, null, 2)}
                  </pre>
                ))}
              </section>
            )}
          </div>
        ) : (
          <section
            data-testid="selected-trace"
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {/* 8 — The waterfall owns the flexible center column. The details
            pane remains a fixed-width sibling so selecting a span never
            changes the timing axis width. */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: "auto",
                padding: 12,
              }}
            >
              <h2
                style={{
                  margin: "0 0 10px",
                  color: "#111827",
                  fontSize: 13,
                }}
              >
                {displayedTraceId}
              </h2>

              {traceTree.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 11 }}>
                  No local spans.
                </div>
              ) : (
                <div
                  data-testid="span-waterfall"
                  style={{
                    minWidth: 560,
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                    borderRadius: 4,
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(180px, 320px) minmax(260px, 1fr)",
                      alignItems: "center",
                      minHeight: 25,
                      borderBottom: "1px solid #e5e7eb",
                      backgroundColor: "#f9fafb",
                      color: "#6b7280",
                      fontSize: 9,
                    }}
                  >
                    <span style={{ padding: "5px 8px" }}>Span</span>
                    <span
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 8px",
                        borderLeft: "1px solid #e5e7eb",
                      }}
                    >
                      <span>0 ms</span>
                      <span>{displayedTraceDuration} ms</span>
                    </span>
                  </div>

                  {traceTree.map((root) => (
                    <SessionsLogsSpanNode
                      key={root.span.spanId}
                      node={root}
                      depth={0}
                      traceStartedAt={displayedTraceStartedAt}
                      traceDuration={displayedTraceDuration}
                      selectedSpanId={displayedSpanId}
                      setSelectedSpanId={setSelectedSpanId}
                    />
                  ))}
                </div>
              )}

              {unattachedLogs.length === 0 &&
              unattachedLinks.length === 0 ? null : (
                <section
                  data-testid="unattached-records"
                  style={{ marginTop: 14 }}
                >
                  <h3
                    style={{
                      margin: "0 0 6px",
                      color: "#111827",
                      fontSize: 12,
                    }}
                  >
                    Unattached
                  </h3>

                  {unattachedLogs.map((log) => (
                    <pre
                      key={log.logId}
                      data-testid={`unattached-log-${log.logId}`}
                      style={{
                        margin: "6px 0 0",
                        padding: 8,
                        overflow: "auto",
                        border: "1px solid #fed7aa",
                        borderRadius: 4,
                        backgroundColor: "#fff7ed",
                        color: "#9a3412",
                        fontSize: 10,
                      }}
                    >
                      {JSON.stringify(log, null, 2)}
                    </pre>
                  ))}

                  {unattachedLinks.map((link) => (
                    <div
                      key={link.linkId}
                      data-testid={`unattached-link-${link.linkId}`}
                      style={{
                        marginTop: 6,
                        padding: 8,
                        border: "1px solid #fed7aa",
                        borderRadius: 4,
                        backgroundColor: "#fff7ed",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <strong style={{ color: "#9a3412", fontSize: 11 }}>
                          Server link without browser span
                        </strong>
                        <button
                          type="button"
                          aria-label={`Copy server trace ${link.traceId}`}
                          onClick={() => {
                            void navigator.clipboard.writeText(link.traceId);
                          }}
                          style={{
                            padding: "3px 7px",
                            border: "1px solid #fdba74",
                            borderRadius: 4,
                            backgroundColor: "#ffffff",
                            color: "#9a3412",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 10,
                          }}
                        >
                          Copy server trace ID
                        </button>
                      </div>
                      <pre
                        style={{
                          margin: "6px 0 0",
                          overflow: "auto",
                          color: "#9a3412",
                          fontSize: 10,
                        }}
                      >
                        {JSON.stringify(link, null, 2)}
                      </pre>
                    </div>
                  ))}
                </section>
              )}

              {sortedUnscopedLogs.length === 0 ? null : (
                <section data-testid="unscoped-logs" style={{ marginTop: 14 }}>
                  <h3
                    style={{
                      margin: "0 0 6px",
                      color: "#111827",
                      fontSize: 12,
                    }}
                  >
                    Unscoped
                  </h3>
                  {sortedUnscopedLogs.map((log) => (
                    <pre
                      key={log.logId}
                      data-testid={`unscoped-log-${log.logId}`}
                      style={{
                        margin: "6px 0 0",
                        padding: 8,
                        overflow: "auto",
                        border: "1px solid #e5e7eb",
                        borderRadius: 4,
                        backgroundColor: "#f9fafb",
                        color: "#374151",
                        fontSize: 10,
                      }}
                    >
                      {JSON.stringify(log, null, 2)}
                    </pre>
                  ))}
                </section>
              )}
            </div>

            {displayedSpan === null ? null : (
              <aside
                aria-label="Span details"
                data-testid="span-details"
                style={{
                  width: 380,
                  flexShrink: 0,
                  minHeight: 0,
                  overflow: "auto",
                  padding: 14,
                  borderLeft: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                }}
              >
                {/* 9 — Span identity and timing stay compact above the main
                payload: the exact attributes object emitted by telemetry. */}
                <h2
                  style={{
                    margin: 0,
                    color: "#111827",
                    fontSize: 15,
                  }}
                >
                  {displayedSpan.name}
                </h2>
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "72px minmax(0, 1fr)",
                    gap: "5px 8px",
                    margin: "10px 0 0",
                    fontSize: 10,
                  }}
                >
                  <dt style={{ color: "#6b7280" }}>Span ID</dt>
                  <dd style={{ minWidth: 0, margin: 0, overflow: "auto" }}>
                    <code>{displayedSpan.spanId}</code>
                  </dd>
                  <dt style={{ color: "#6b7280" }}>Status</dt>
                  <dd style={{ margin: 0 }}>{displayedSpan.status}</dd>
                  <dt style={{ color: "#6b7280" }}>Duration</dt>
                  <dd style={{ margin: 0 }}>
                    {Math.max(
                      displayedSpan.endedAt - displayedSpan.startedAt,
                      0,
                    )} {" "}
                    ms
                  </dd>
                </dl>

                <section style={{ marginTop: 16 }}>
                  <h3
                    style={{
                      margin: "0 0 6px",
                      color: "#111827",
                      fontSize: 12,
                    }}
                  >
                    Attributes
                  </h3>
                  {displayedSpan.attributes === null ? (
                    <div style={{ color: "#6b7280", fontSize: 10 }}>
                      No attributes.
                    </div>
                  ) : (
                    <pre
                      aria-label={`Attributes for ${displayedSpan.name}`}
                      style={{
                        margin: 0,
                        padding: 8,
                        overflow: "auto",
                        border: "1px solid #e5e7eb",
                        borderRadius: 4,
                        backgroundColor: "#ffffff",
                        color: "#374151",
                        fontSize: 10,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(displayedSpan.attributes, null, 2)}
                    </pre>
                  )}
                </section>

                {/* 10 — Existing attached diagnostic records move with the
                selected span; their test identities and copy action remain
                unchanged. */}
                {displayedSpanLogs.length === 0 ? null : (
                  <section style={{ marginTop: 16 }}>
                    <h3
                      style={{
                        margin: "0 0 6px",
                        color: "#111827",
                        fontSize: 12,
                      }}
                    >
                      Logs
                    </h3>
                    {displayedSpanLogs.map((log) => (
                      <pre
                        key={log.logId}
                        data-testid={`span-log-${log.logId}`}
                        style={{
                          margin: "6px 0 0",
                          padding: 8,
                          overflow: "auto",
                          border: "1px solid #e5e7eb",
                          borderRadius: 4,
                          backgroundColor: "#ffffff",
                          color: "#374151",
                          fontSize: 10,
                        }}
                      >
                        {JSON.stringify(log, null, 2)}
                      </pre>
                    ))}
                  </section>
                )}

                {displayedSpanLinks.map((link) => (
                  <div
                    key={link.linkId}
                    data-testid={`attached-link-${link.linkId}`}
                    style={{
                      marginTop: 16,
                      padding: 8,
                      border: "1px solid #bfdbfe",
                      borderRadius: 4,
                      backgroundColor: "#eff6ff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <strong style={{ color: "#1e3a8a", fontSize: 11 }}>
                        Server link
                      </strong>
                      <button
                        type="button"
                        aria-label={`Copy server trace ${link.traceId}`}
                        onClick={() => {
                          void navigator.clipboard.writeText(link.traceId);
                        }}
                        style={{
                          padding: "3px 7px",
                          border: "1px solid #93c5fd",
                          borderRadius: 4,
                          backgroundColor: "#ffffff",
                          color: "#1d4ed8",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 10,
                        }}
                      >
                        Copy server trace ID
                      </button>
                    </div>
                    <pre
                      style={{
                        margin: "6px 0 0",
                        overflow: "auto",
                        color: "#1e3a8a",
                        fontSize: 10,
                      }}
                    >
                      {JSON.stringify(link, null, 2)}
                    </pre>
                  </div>
                ))}
              </aside>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
