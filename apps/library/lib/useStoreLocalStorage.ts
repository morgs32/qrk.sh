import { useEffect } from "react";

import type { StoreApi } from "zustand";

export function useStoreLocalStorage<STATE>(
  store: StoreApi<STATE>,
  options: {
    name: string;
    version?: number;
    partialize: (state: STATE) => unknown;
    migrate?: (persisted: unknown, version: number) => unknown;
    onAfterRehydrate?: (state: STATE) => void;
  },
) {
  const { name, version = 0, partialize, migrate, onAfterRehydrate } = options;

  useEffect(() => {
    let skipNextWrite = true;

    try {
      const raw = localStorage.getItem(name);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        const persistedVersion =
          parsed !== null &&
          typeof parsed === "object" &&
          "version" in parsed &&
          typeof parsed.version === "number"
            ? parsed.version
            : 0;
        const persistedState =
          parsed !== null && typeof parsed === "object" && "state" in parsed
            ? parsed.state
            : parsed;
        const nextState =
          migrate !== undefined ? migrate(persistedState, persistedVersion) : persistedState;
        if (nextState !== null && typeof nextState === "object") {
          store.setState(nextState as Partial<STATE>);
        }
      }
    } catch {
      // Ignore corrupt localStorage; keep in-memory defaults.
    }

    onAfterRehydrate?.(store.getState());

    const unsubscribe = store.subscribe((state) => {
      if (skipNextWrite) {
        skipNextWrite = false;
        return;
      }
      try {
        localStorage.setItem(
          name,
          JSON.stringify({
            state: partialize(state),
            version,
          }),
        );
      } catch {
        // Ignore quota / private-mode write failures.
      }
    });

    skipNextWrite = false;
    return unsubscribe;
  }, [store, name, version, partialize, migrate, onAfterRehydrate]);
}
