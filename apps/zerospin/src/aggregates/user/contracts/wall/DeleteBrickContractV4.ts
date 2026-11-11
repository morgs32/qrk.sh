import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { deleteBrickV3 } from "./DeleteBrickContractV3";

export const deleteBrickV4 = upgradeAggregateContractRelease(deleteBrickV3, {
  version: 4,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("deleteBrickV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
