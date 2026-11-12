import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { addBrickV9 } from "./AddBrickContractV9";

export const addBrickV10 = upgradeAggregateContractRelease(addBrickV9, {
  version: 10,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick },
  operations: { createBrick: brick.operations.create },
  down: Effect.fn("addBrickV10.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "spotify") return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
