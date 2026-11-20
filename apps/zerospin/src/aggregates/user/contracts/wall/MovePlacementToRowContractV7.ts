import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { movePlacementToRowV6 } from "./MovePlacementToRowContractV6";

export const movePlacementToRowV7 = upgradeAggregateContractRelease(movePlacementToRowV6, {
  version: 7,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  down: Effect.fn("movePlacementToRowV7.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
