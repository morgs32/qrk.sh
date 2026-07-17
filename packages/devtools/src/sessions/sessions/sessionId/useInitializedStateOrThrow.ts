import type {
  IFrontendController,
  InferFrontendModels,
} from "@zerospin/core/frontendController/types";
import type {
  IInitializedSessionState,
  ISession,
} from "@zerospin/core/session/types";
import { ZerospinError } from "@zerospin/error";
import { useStore } from "zustand/react";

export function useInitializedStateOrThrow<
  FRONTEND extends IFrontendController,
>(
  session: ISession<FRONTEND>,
): IInitializedSessionState<InferFrontendModels<FRONTEND>> {
  return useStore(session.store, (state) => {
    if (!state.isInitialized || state.db === null || state.schema === null) {
      throw new ZerospinError({
        code: "session-store-not-initialized",
        message: "Session store is not initialized",
      });
    }
    return state;
  });
}
