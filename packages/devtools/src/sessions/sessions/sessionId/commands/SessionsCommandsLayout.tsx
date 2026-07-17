import { useState } from "react";

import { getInitializedStateOrThrow } from "@zerospin/core/session/getInitializedStateOrThrow";
import type { ISession, ISessionId } from "@zerospin/core/session/types";
import { Outlet, useMatch, useNavigate, useParams } from "react-router";

import { useLiveQueryOnDb } from "../../../../useLiveQueryOnDb";
import { sessionsDatabaseTabStyles } from "../database/sessionsDatabaseTabStyles";
import { useSession } from "../useSession";

const commandSidebarRows = [
  { segment: "staged", label: "Staged" },
  { segment: "pushed", label: "Pushed" },
  { segment: "failed", label: "Failed" },
  { segment: "executed", label: "Executed" },
] as const;

function SessionsCommandsLayoutBody(props: {
  readonly session: ISession;
  readonly sessionId: ISessionId;
}) {
  const { session, sessionId } = props;
  const segmentMatch = useMatch("/sessions/:sessionId/commands/:segment");
  const activeSegment = segmentMatch?.params.segment;
  const navigate = useNavigate();
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const { db } = getInitializedStateOrThrow({ session });

  const { data: stagedCommands, updatedAt } = useLiveQueryOnDb({
    db,
    deps: [],
    query: (db) => db.query.stagedCommands!.findMany(),
    tableNames: ["stagedCommands"],
  });

  const stagedCount = stagedCommands.length;
  const showStagedBadge = updatedAt !== undefined;

  return (
    <div style={sessionsDatabaseTabStyles.dbRoot}>
      <aside style={sessionsDatabaseTabStyles.dbAside}>
        <div style={sessionsDatabaseTabStyles.dbList}>
          {commandSidebarRows.map(({ segment, label }) => {
            const isSelected = activeSegment === segment;
            const isHovered = segment === hoveredSegment;
            const isStaged = segment === "staged";
            return (
              <button
                key={segment}
                type="button"
                onClick={() => {
                  void navigate(`/sessions/${sessionId}/commands/${segment}`);
                }}
                onMouseEnter={() => setHoveredSegment(segment)}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{
                  ...sessionsDatabaseTabStyles.dbRow,
                  backgroundColor: isSelected
                    ? "#f3f4f6"
                    : isHovered
                      ? "#f9fafb"
                      : "transparent",
                }}
              >
                {isStaged ? (
                  <span style={sessionsDatabaseTabStyles.dbRowInner}>
                    <span>{label}</span>
                    {showStagedBadge ? (
                      <span style={sessionsDatabaseTabStyles.dbRowBadge}>
                        {stagedCount}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  label
                )}
              </button>
            );
          })}
        </div>
      </aside>
      <div style={sessionsDatabaseTabStyles.dbDetail}>
        <Outlet />
      </div>
    </div>
  );
}

export function SessionsCommandsLayout() {
  const session = useSession();
  const { sessionId } = useParams<{ sessionId: ISessionId }>();

  if (session === undefined || sessionId === undefined) {
    return null;
  }

  return <SessionsCommandsLayoutBody session={session} sessionId={sessionId} />;
}
