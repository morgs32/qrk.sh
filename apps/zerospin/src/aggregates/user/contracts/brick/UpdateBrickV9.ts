import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { updateBrickV8 } from "./UpdateBrickV8";

export const updateBrickV9 = upgradeAggregateContractRelease(updateBrickV8, {
  version: 9,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("updateBrickV9.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "image-carousel") return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
