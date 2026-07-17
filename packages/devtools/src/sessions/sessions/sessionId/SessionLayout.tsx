import type { CSSProperties } from "react";

import type { ISessionId } from "@zerospin/core/session/types";
import { Navigate, Outlet, useParams } from "react-router";

import { useSession } from "./useSession";

const styles = {
  root: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
} as const;

export function SessionLayout() {
  const session = useSession();

  const { sessionId } = useParams<{ sessionId: ISessionId }>();

  if (!session && sessionId) {
    return <Navigate to="/sessions" replace />;
  }

  return (
    <div style={styles.root}>
      <Outlet />
    </div>
  );
}
