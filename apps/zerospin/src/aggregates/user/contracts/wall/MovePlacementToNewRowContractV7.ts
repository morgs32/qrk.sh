import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { movePlacementToNewRowV6 } from "./MovePlacementToNewRowContractV6";

export const movePlacementToNewRowV7 = upgradeAggregateContractRelease(movePlacementToNewRowV6, {
  version: 7,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("movePlacementToNewRowV7.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
