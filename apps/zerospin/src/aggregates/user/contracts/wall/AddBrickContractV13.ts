import { candidateLibraryV20 } from "@qrk.sh/bricks/modules/candidateLibrary";
import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { makeAddBrickProgram } from "./AddBrickContractV11";
import { addBrickV12 } from "./AddBrickContractV12";

export const addBrickV13 = upgradeAggregateContractRelease(addBrickV12, {
  version: 13,
  payload: {},
  program: makeAddBrickProgram(candidateLibraryV20),
  down: Effect.fn("addBrickV13.down")(function* (props) {
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
