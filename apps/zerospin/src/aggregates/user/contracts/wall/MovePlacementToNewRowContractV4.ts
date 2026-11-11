import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { movePlacementToNewRowV3 } from "./MovePlacementToNewRowContractV3";

export const movePlacementToNewRowV4 = upgradeAggregateContractRelease(movePlacementToNewRowV3, {
  version: 4,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("movePlacementToNewRowV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
