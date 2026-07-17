import { useStore } from "zustand/react";

import { zerospinDevtoolsStore } from "../zerospinDevtoolsStore.js";

export function SharedWorkerRoute() {
  // A non-null handle means browser bootstrap connected to the SharedWorker,
  // initialized its user database, and received the user-scoped RPC API.
  const sharedWorkerUserApi = useStore(
    zerospinDevtoolsStore,
    (state) => state.sharedWorkerUserApi,
  );

  return (
    <p style={{ margin: 0, padding: 12 }}>
      {sharedWorkerUserApi === null
        ? "Shared Worker is disabled"
        : "Shared Worker is enabled"}
    </p>
  );
}
