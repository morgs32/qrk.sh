import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { movePlacementToRowV4 } from "./MovePlacementToRowContractV4";

export const movePlacementToRowV5 = upgradeAggregateContractRelease(movePlacementToRowV4, {
  version: 5,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("movePlacementToRowV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
