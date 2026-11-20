import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { movePlacementToNewStackV8 } from "./MovePlacementToNewStackContractV8";

export const movePlacementToNewStackV9 = upgradeAggregateContractRelease(movePlacementToNewStackV8, {
  version: 9,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  down: Effect.fn("movePlacementToNewStackV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
