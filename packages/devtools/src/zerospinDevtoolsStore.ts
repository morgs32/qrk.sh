import type { ISessionId } from "@zerospin/core/session/types";
import { createStore } from "zustand/vanilla";

import type {
  IDevtoolsSessionEntry,
  IZerospinDevtoolsStoreState,
} from "./types.js";

export const zerospinDevtoolsStore = createStore<IZerospinDevtoolsStoreState>()(
  (set) => ({
    sessionsById: new Map(),
    profiles: [],
    sharedWorkerUserApi: null,
    addSession: (entry: IDevtoolsSessionEntry) =>
      set((state) => {
        if (state.sessionsById.has(entry.session.sessionId)) {
          return state;
        }
        const nextSessionsById = new Map(state.sessionsById);
        nextSessionsById.set(entry.session.sessionId, entry);
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
