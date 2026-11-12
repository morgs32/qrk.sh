import { candidateLibraryV20 } from "@qrk.sh/bricks/modules/candidateLibrary";
import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { makeUpdateBrickGuard, makeUpdateBrickProgram } from "./UpdateBrickV12";
import { updateBrickV13 } from "./UpdateBrickV13";

export const updateBrickV14 = upgradeAggregateContractRelease(updateBrickV13, {
  version: 14,
  payload: {},
  guard: makeUpdateBrickGuard(candidateLibraryV20),
  program: makeUpdateBrickProgram(candidateLibraryV20),
  down: Effect.fn("updateBrickV14.down")(function* (props) {
    const { payload } = props;
    const { state } = payload;
    if (payload.moduleId !== "image" || state === null || typeof state !== "object" || !("round" in state)) {
      return payload;
    }
    const { round, ...rectangularState } = state;
    if (round === true) return DownAdapterRefused;
    return { ...payload, state: rectangularState };
  }),
});
