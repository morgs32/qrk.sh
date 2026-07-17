import { useState } from "react";

import { Outlet, useNavigate, useParams } from "react-router";

import { useSession } from "../useSession";

import { sessionsDatabaseTabStyles } from "./sessionsDatabaseTabStyles";

function decodeModelNameParam(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function SessionsDatabaseLayout() {
  const session = useSession();
  const { sessionId, modelName } = useParams();
  const navigate = useNavigate();
  const decodedSelected =
    modelName === undefined ? null : decodeModelNameParam(modelName);
  const [hoveredModelName, setHoveredModelName] = useState<string | null>(null);

  if (session === undefined || sessionId === undefined) {
    return null;
  }

  const modelNames = session.frontend.modelNames;

  if (modelNames.length === 0) {
    return (
      <div style={sessionsDatabaseTabStyles.dbEmptyState}>
        No models on frontend
      </div>
    );
  }

  return (
    <div style={sessionsDatabaseTabStyles.dbRoot}>
      <aside style={sessionsDatabaseTabStyles.dbAside}>
        <div style={sessionsDatabaseTabStyles.dbList}>
          {modelNames.map((name) => {
            const isSelected = decodedSelected === name;
            const isHovered = name === hoveredModelName;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  void navigate(
                    `/sessions/${sessionId}/database/${encodeURIComponent(name)}`,
                  );
                }}
                onMouseEnter={() => setHoveredModelName(name)}
                onMouseLeave={() => setHoveredModelName(null)}
                style={{
                  ...sessionsDatabaseTabStyles.dbRow,
                  backgroundColor: isSelected
                    ? "#f3f4f6"
                    : isHovered
                      ? "#f9fafb"
                      : "transparent",
                }}
              >
                {name}
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
