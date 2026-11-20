import { DownAdapterRefused, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { addBrickV6 } from "./AddBrickContractV6";

export const addBrickV7 = upgradeAggregateContractRelease(addBrickV6, {
  version: 7,
  payload: { moduleId: brick.attributes.moduleId },
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { createBrick: brick.operations.create },
  down: Effect.fn("addBrickV7.down")(function* (props) {
    const { payload } = props;
    if (payload.moduleId === "behance" || payload.moduleId === "buy-me-a-coffee")
      return DownAdapterRefused;
    return { ...payload, moduleId: payload.moduleId };
  }),
});
