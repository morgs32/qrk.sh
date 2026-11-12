import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { deleteBrickV6 } from "./DeleteBrickContractV6";

export const deleteBrickV7 = upgradeAggregateContractRelease(deleteBrickV6, {
  version: 7,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("deleteBrickV7.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
