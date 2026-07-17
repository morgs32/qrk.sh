import { useEffect, useState, type CSSProperties } from "react";

import type { IProfilerProfile } from "../types";
import { zerospinDevtoolsStore } from "../zerospinDevtoolsStore";
import { Outlet, useMatch, useNavigate } from "react-router";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";

const styles = {
  root: {
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "stretch",
    minHeight: 200,
    height: "100%",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  listPane: {
    flex: "0 0 25%",
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #e5e7eb",
  } satisfies CSSProperties,
  tableScroll: {
    flex: 1,
    minHeight: 0,
    overflowX: "auto",
    overflowY: "auto",
  } satisfies CSSProperties,
  table: {
    width: "100%",
    tableLayout: "fixed",
    fontSize: 12,
    borderCollapse: "collapse",
  } satisfies CSSProperties,
  tableHeader: {
    backgroundColor: "#f3f4f6",
    position: "sticky",
    top: 0,
    zIndex: 1,
  } satisfies CSSProperties,
  tr: {
    borderBottom: "1px solid #f3f4f6",
    cursor: "pointer",
  } satisfies CSSProperties,
  td: {
    padding: "4px 12px",
  } satisfies CSSProperties,
  thTime: {
    padding: "4px 12px",
    fontWeight: 500,
    textAlign: "left",
    color: "#6b7280",
    width: "30%",
  } satisfies CSSProperties,
  thId: {
    padding: "4px 12px",
    fontWeight: 500,
    textAlign: "left",
    color: "#6b7280",
    width: "auto",
  } satisfies CSSProperties,
  tdTime: {
    padding: "4px 12px",
    fontFamily: "ui-monospace, monospace",
    color: "#374151",
    verticalAlign: "middle",
    width: "30%",
  } satisfies CSSProperties,
  tdId: {
    padding: "4px 12px",
    fontFamily: "ui-monospace, monospace",
    color: "#9333ea",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  } satisfies CSSProperties,
  detailPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
} as const;

function formatTime(recordedAt: number): string {
  return new Date(recordedAt).toLocaleTimeString();
}

function truncateId(id: string, max = 14): string {
  if (id.length <= max) {
    return id;
  }
  return `${id.slice(0, max)}…`;
}

export function ProfilerLayout() {
  const profiles = useStore(
    zerospinDevtoolsStore,
    useShallow((s): ReadonlyArray<IProfilerProfile> => s.profiles),
  );

  const profileMatch = useMatch("/profiler/:profileId/*");
  const profileIdParam =
    typeof profileMatch?.params.profileId === "string"
      ? profileMatch.params.profileId
      : undefined;

  const navigate = useNavigate();
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  useEffect(() => {
    if (profiles.length === 0) {
      if (profileIdParam !== undefined) {
        void navigate("/profiler", { replace: true });
      }
      return;
    }

    const first = profiles[0];
    if (first === undefined) {
      return;
    }

    if (profileIdParam === undefined) {
      void navigate(`/profiler/${first.id}/props`, { replace: true });
      return;
    }

    const idIsValid = profiles.some((x) => x.id === profileIdParam);
    if (!idIsValid) {
      void navigate(`/profiler/${first.id}/props`, { replace: true });
    }
  }, [profiles, profileIdParam, navigate]);

  return (
    <div style={styles.root}>
      <div style={styles.listPane}>
        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: "30%" }} />
              <col />
            </colgroup>
            <thead style={styles.tableHeader}>
              <tr>
                <th style={styles.thTime}>Time</th>
                <th style={styles.thId}>Id</th>
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 ? (
                <tr style={styles.tr}>
                  <td colSpan={2} style={{ ...styles.td, color: "#6b7280" }}>
                    No profiles
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => {
                  const isSelected =
                    profileIdParam !== undefined &&
                    profile.id === profileIdParam;
                  const isRowHovered =
                    hoveredRowId !== null && hoveredRowId === profile.id;
                  return (
                    <tr
                      key={profile.id}
                      onClick={() => {
                        void navigate(`/profiler/${profile.id}/props`);
                      }}
                      onMouseEnter={() => setHoveredRowId(profile.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      style={{
                        ...styles.tr,
                        backgroundColor: isSelected
                          ? "#eff6ff"
                          : isRowHovered
                            ? "#f3f4f6"
                            : "transparent",
                      }}
                    >
                      <td style={styles.tdTime}>
                        {formatTime(profile.recordedAt)}
                      </td>
                      <td style={styles.tdId} title={profile.id}>
                        {truncateId(profile.id)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={styles.detailPane}>
        <Outlet />
      </div>
    </div>
  );
}
