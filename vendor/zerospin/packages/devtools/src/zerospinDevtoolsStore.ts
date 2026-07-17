import type { ISession, ISessionId } from "@zerospin/core/session/types";
import { createStore } from "zustand/vanilla";

import type { IZerospinDevtoolsStoreState } from "./types.js";

export const zerospinDevtoolsStore = createStore<IZerospinDevtoolsStoreState>()(
  (set) => ({
    sessionsById: new Map(),
    profiles: [],
    sharedWorkerUserApi: null,
    addSession: (session: ISession) =>
      set((state) => {
        if (state.sessionsById.has(session.sessionId)) {
          return state;
        }
        const nextSessionsById = new Map(state.sessionsById);
        nextSessionsById.set(session.sessionId, session);
        return { sessionsById: nextSessionsById };
      }),
    removeSession: (sessionId: ISessionId) =>
      set((state) => {
        if (!state.sessionsById.has(sessionId)) {
          return state;
        }
        const nextSessionsById = new Map(state.sessionsById);
        nextSessionsById.delete(sessionId);
        return { sessionsById: nextSessionsById };
      }),
    setSharedWorkerUserApi: (
      sharedWorkerUserApi: IZerospinDevtoolsStoreState["sharedWorkerUserApi"],
    ) =>
      set((state) => {
        if (state.sharedWorkerUserApi === sharedWorkerUserApi) {
          return state;
        }
        return { sharedWorkerUserApi };
      }),
  }),
);
