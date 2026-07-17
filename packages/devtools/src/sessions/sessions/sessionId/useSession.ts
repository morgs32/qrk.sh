import type { ISession, ISessionId } from "@zerospin/core/session/types";
import { useParams } from "react-router";
import { useStore } from "zustand/react";

import { zerospinDevtoolsStore } from "../../../zerospinDevtoolsStore.js";

export function useSession(): ISession | undefined {
  const { sessionId } = useParams<{ sessionId: ISessionId }>();
  return useStore(
    zerospinDevtoolsStore,
    (state) =>
      sessionId === undefined
        ? undefined
        : state.sessionsById.get(sessionId)?.session,
  );
}

export function useSessionOrThrow(): ISession {
  const session = useSession();
  if (!session) {
    throw new Error("Session not found");
  }
  return session;
}
