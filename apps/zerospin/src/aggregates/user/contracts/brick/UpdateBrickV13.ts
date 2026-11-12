import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { updateBrickV12 } from "./UpdateBrickV12";

export const updateBrickV13 = upgradeAggregateContractRelease(updateBrickV12, {
  version: 13,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("updateBrickV13.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "youtube") return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
