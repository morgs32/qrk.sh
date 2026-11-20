import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { movePlacementToRowV7 } from "./MovePlacementToRowContractV7";

export const movePlacementToRowV8 = upgradeAggregateContractRelease(movePlacementToRowV7, {
  version: 8,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("movePlacementToRowV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
