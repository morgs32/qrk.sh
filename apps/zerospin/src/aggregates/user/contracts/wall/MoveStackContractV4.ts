import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { moveStackV3 } from "./MoveStackContractV3";

export const moveStackV4 = upgradeAggregateContractRelease(moveStackV3, {
  version: 4,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("moveStackV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
