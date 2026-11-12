import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { deleteStackV3 } from "./DeleteStackContractV3";

export const deleteStackV4 = upgradeAggregateContractRelease(deleteStackV3, {
  version: 4,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("deleteStackV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
