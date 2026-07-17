import { useEffect, useState, type CSSProperties } from "react";

import type { ISession, ISessionId } from "@zerospin/core/session/types";
import { zerospinDevtoolsStore } from "../../zerospinDevtoolsStore";
import { Outlet, useMatch, useNavigate } from "react-router";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";

import { SessionsActorIdCell } from "../SessionsActorIdCell";
import { SessionsDataCell } from "../SessionsDataCell";

const styles = {
  root: {
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "stretch",
    minHeight: 200,
    height: "100%",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  sessionsPane: {
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
    width: "max-content",
    minWidth: "100%",
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
  thFrontend: {
    padding: "4px 12px",
    fontWeight: 500,
    textAlign: "left",
    color: "#6b7280",
    width: 100,
  } satisfies CSSProperties,
  thSession: {
    padding: "4px 12px",
    fontWeight: 500,
    textAlign: "left",
    color: "#6b7280",
    width: 220,
  } satisfies CSSProperties,
  thActor: {
    padding: "4px 12px",
    fontWeight: 500,
    textAlign: "left",
    color: "#6b7280",
    width: 220,
  } satisfies CSSProperties,
  tdFrontend: {
    padding: "4px 12px",
    color: "#9333ea",
    fontFamily: "ui-monospace, monospace",
    width: 100,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  } satisfies CSSProperties,
  tdCopyCell: {
    padding: "4px 12px",
    color: "#374151",
    fontFamily: "ui-monospace, monospace",
    width: 220,
    overflow: "hidden",
    verticalAlign: "middle",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  tdActorCell: {
    padding: "4px 12px",
    color: "#374151",
    fontFamily: "ui-monospace, monospace",
    width: 220,
    overflow: "hidden",
    verticalAlign: "middle",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  detailPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
} as const;

export function SessionsLayout() {
  const sessions = useStore(
    zerospinDevtoolsStore,
    useShallow(
      (state): Array<ISession> =>
        Array.from(state.sessionsById.values(), (entry) => entry.session),
    ),
  );

  const sessionMatch = useMatch("/sessions/:sessionId/*");
  const sessionIdParam =
    typeof sessionMatch?.params.sessionId === "string"
      ? sessionMatch.params.sessionId
      : undefined;

  const navigate = useNavigate();
  const [hoveredRowSessionId, setHoveredRowSessionId] =
    useState<ISessionId | null>(null);

  useEffect(() => {
    if (sessions.length === 0) {
      if (sessionIdParam !== undefined) {
        void navigate("/sessions", { replace: true });
      }
      return;
    }

    const first = sessions[0];
    if (first === undefined) {
      return;
    }

    if (sessionIdParam === undefined) {
      void navigate(`/sessions/${first.sessionId}/commands/staged`, {
        replace: true,
      });
      return;
    }

    const idIsValid = sessions.some((x) => x.sessionId === sessionIdParam);
    if (!idIsValid) {
      void navigate(`/sessions/${first.sessionId}/commands/staged`, {
        replace: true,
      });
    }
  }, [sessions, sessionIdParam, navigate]);

  return (
    <div style={styles.root}>
      <div style={styles.sessionsPane}>
        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: 100 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 220 }} />
            </colgroup>
            <thead style={styles.tableHeader}>
              <tr>
                <th style={styles.thFrontend}>Frontend</th>
                <th style={styles.thSession}>Session</th>
                <th style={styles.thActor}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr style={styles.tr}>
                  <td colSpan={3} style={{ ...styles.td, color: "#6b7280" }}>
                    No sessions
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                  const isSelected =
                    sessionIdParam !== undefined &&
                    session.sessionId === sessionIdParam;
                  const isRowHovered =
                    hoveredRowSessionId !== null &&
                    hoveredRowSessionId === session.sessionId;
                  return (
                    <tr
                      key={session.sessionId}
                      onClick={() => {
                        void navigate(
                          `/sessions/${session.sessionId}/commands/staged`,
                        );
                      }}
                      onMouseEnter={() =>
                        setHoveredRowSessionId(session.sessionId)
                      }
                      onMouseLeave={() => setHoveredRowSessionId(null)}
                      style={{
                        ...styles.tr,
                        backgroundColor: isSelected
                          ? "#eff6ff"
                          : isRowHovered
                            ? "#f3f4f6"
                            : "transparent",
                      }}
                    >
                      <td
                        style={styles.tdFrontend}
                        title={session.frontend.actorName}
                      >
                        {session.frontend.actorName}
                      </td>
                      <SessionsDataCell
                        text={session.sessionId}
                        ariaLabel="Copy session id"
                        tdStyle={styles.tdCopyCell}
                      />
                      <SessionsActorIdCell
                        session={session}
                        tdStyle={styles.tdActorCell}
                      />
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
