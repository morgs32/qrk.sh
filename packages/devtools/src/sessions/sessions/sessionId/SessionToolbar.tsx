import { useState, type CSSProperties } from "react";

import { getInitializedStateOrThrow } from "@zerospin/core/session/getInitializedStateOrThrow";
import type { ISessionId } from "@zerospin/core/session/types";
import { Link, useParams } from "react-router";
import { useStore } from "zustand/react";

import { useLiveQueryOnDb } from "../../../useLiveQueryOnDb";
import { zerospinDevtoolsStore } from "../../../zerospinDevtoolsStore.js";

const styles = {
  toolbarRoot: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: "4px 12px",
    backgroundColor: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  } satisfies CSSProperties,
  label: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#374151",
    cursor: "pointer",
  } satisfies CSSProperties,
  pushButton: {
    border: "1px solid #d1d5db",
    borderRadius: 4,
    padding: "2px 8px",
    backgroundColor: "#ffffff",
    color: "#374151",
    fontFamily: "inherit",
    fontSize: 12,
  } satisfies CSSProperties,
  traceLink: {
    color: "#2563eb",
    fontSize: 12,
    textDecoration: "underline",
  } satisfies CSSProperties,
} as const;

export function SessionToolbar() {
  const { sessionId } = useParams<{ sessionId: ISessionId }>();
  const entry = useStore(zerospinDevtoolsStore, (state) =>
    sessionId === undefined ? undefined : state.sessionsById.get(sessionId),
  );
  if (entry === undefined) {
    throw new Error("Session not found");
  }
  const { pushStagedCommands, session } = entry;
  const [isPushing, setIsPushing] = useState(false);
  const isPushPaused = useStore(session.store, (state) => state.isPushPaused);
  const lastDevtoolsPush = useStore(
    session.store,
    (state) => state.lastDevtoolsPush,
  );
  const { db } = getInitializedStateOrThrow({ session });

  const { data: stagedCommands } = useLiveQueryOnDb({
    db,
    deps: [],
    query: (db) => db.query.stagedCommands!.findMany(),
    tableNames: ["stagedCommands"],
  });

  const pushDisabled =
    !isPushPaused || stagedCommands.length === 0 || isPushing;

  return (
    <div style={styles.toolbarRoot}>
      <label style={styles.label}>
        <input
          type="checkbox"
          checked={isPushPaused}
          onChange={(event) => {
            session.store.setState({ isPushPaused: event.target.checked });
          }}
        />
        Pause push
      </label>
      <button
        type="button"
        aria-label="Push staged commands"
        disabled={pushDisabled}
        onClick={() => {
          // 1 — The toolbar owns only the in-flight presentation state. The
          // registered push boundary records the completed trace and preserves
          // the push result or rejection for non-UI callers.
          setIsPushing(true);
          void pushStagedCommands()
            .catch(() => undefined)
            .finally(() => {
              setIsPushing(false);
            });
        }}
        style={{
          ...styles.pushButton,
          cursor: pushDisabled ? "not-allowed" : "pointer",
          opacity: pushDisabled ? 0.5 : 1,
        }}
      >
        {isPushing ? "Pushing…" : "Push"}
      </button>
      {lastDevtoolsPush === null ? null : (
        <Link
          to={`/sessions/${session.sessionId}/logs?traceId=${lastDevtoolsPush.traceId}`}
          title={new Date(lastDevtoolsPush.completedAt).toISOString()}
          style={styles.traceLink}
        >
          {lastDevtoolsPush.status === "error"
            ? "Push failed at "
            : "Pushed at "}
          {new Date(lastDevtoolsPush.completedAt).toLocaleTimeString(
            undefined,
            {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              fractionalSecondDigits: 3,
            },
          )}
        </Link>
      )}
    </div>
  );
}
