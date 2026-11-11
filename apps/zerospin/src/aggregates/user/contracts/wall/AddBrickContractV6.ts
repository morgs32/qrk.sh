import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { addBrickV5 } from "./AddBrickContractV5";

export const addBrickV6 = upgradeAggregateContractRelease(addBrickV5, {
  version: 6,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("addBrickV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
