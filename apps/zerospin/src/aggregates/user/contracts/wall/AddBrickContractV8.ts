import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { addBrickV7 } from "./AddBrickContractV7";

export const addBrickV8 = upgradeAggregateContractRelease(addBrickV7, {
  version: 8,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { createBrick: brick.operations.create },
  down: Effect.fn("addBrickV8.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "image-carousel") return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
