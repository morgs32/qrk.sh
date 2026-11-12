import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { updateBrickV10 } from "./UpdateBrickV10";

export const updateBrickV11 = upgradeAggregateContractRelease(updateBrickV10, {
  version: 11,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("updateBrickV11.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "spotify") return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
