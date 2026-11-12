import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { movePlacementToRowV7 } from "./MovePlacementToRowContractV7";

export const movePlacementToRowV8 = upgradeAggregateContractRelease(movePlacementToRowV7, {
  version: 8,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("movePlacementToRowV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
