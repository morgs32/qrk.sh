import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { addBrickV11 } from "./AddBrickContractV11";

export const addBrickV12 = upgradeAggregateContractRelease(addBrickV11, {
  version: 12,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { createBrick: brick.operations.create },
  down: Effect.fn("addBrickV12.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "youtube") return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
