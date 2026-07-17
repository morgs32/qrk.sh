import type { ISpanId, ISpanTreeNode } from "@zerospin/logger";

export function SessionsLogsSpanNode(props: {
  readonly node: ISpanTreeNode;
  readonly depth: number;
  readonly traceStartedAt: number;
  readonly traceDuration: number;
  readonly selectedSpanId: ISpanId | null;
  readonly setSelectedSpanId: (spanId: ISpanId) => void;
}) {
  const {
    node,
    depth,
    traceStartedAt,
    traceDuration,
    selectedSpanId,
    setSelectedSpanId,
  } = props;
  const spanDuration = Math.max(node.span.endedAt - node.span.startedAt, 0);
  const startPercent =
    ((node.span.startedAt - traceStartedAt) / traceDuration) * 100;
  const widthPercent = (spanDuration / traceDuration) * 100;

  return (
    <div data-testid={`span-${node.span.spanId}`}>
      {/* 1 — The whole row is the selection target. The name column indents
      independently so every duration bar keeps the same trace-wide axis. */}
      <button
        type="button"
        aria-label={`Select span ${node.span.name}`}
        aria-pressed={selectedSpanId === node.span.spanId}
        onClick={() => setSelectedSpanId(node.span.spanId)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 320px) minmax(260px, 1fr)",
          alignItems: "center",
          width: "100%",
          minHeight: 30,
          padding: 0,
          border: "none",
          borderBottom: "1px solid #f3f4f6",
          backgroundColor:
            selectedSpanId === node.span.spanId ? "#eff6ff" : "#ffffff",
          color: "#111827",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            minWidth: 0,
            padding: `6px 8px 6px ${8 + depth * 16}px`,
          }}
        >
          <strong
            style={{
              minWidth: 0,
              overflow: "hidden",
              fontSize: 11,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.span.name}
          </strong>
          <span style={{ flexShrink: 0, color: "#6b7280", fontSize: 10 }}>
            {spanDuration} ms
          </span>
        </span>

        {/* 2 — Percentages are derived from the selected trace's single
        timing range. A three-pixel minimum keeps instant spans selectable. */}
        <span
          aria-hidden="true"
          style={{
            position: "relative",
            height: 20,
            overflow: "hidden",
            borderLeft: "1px solid #e5e7eb",
            backgroundImage:
              "linear-gradient(to right, #f3f4f6 1px, transparent 1px)",
            backgroundSize: "10% 100%",
          }}
        >
          <span
            data-testid={`span-waterfall-bar-${node.span.spanId}`}
            style={{
              position: "absolute",
              top: 4,
              bottom: 4,
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
              minWidth: 3,
              borderRadius: 2,
              backgroundColor:
                node.span.status === "error"
                  ? "#ef4444"
                  : node.span.status === "lost"
                    ? "#f59e0b"
                    : "#3b82f6",
            }}
          />
        </span>
      </button>

      {/* 3 — Tree recursion preserves execution hierarchy while every child
      receives the exact same timing range and selection state. */}
      {node.children.map((child) => (
        <SessionsLogsSpanNode
          key={child.span.spanId}
          node={child}
          depth={depth + 1}
          traceStartedAt={traceStartedAt}
          traceDuration={traceDuration}
          selectedSpanId={selectedSpanId}
          setSelectedSpanId={setSelectedSpanId}
        />
      ))}
    </div>
  );
}
