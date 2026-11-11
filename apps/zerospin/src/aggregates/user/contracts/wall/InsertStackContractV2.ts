import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { insertStackV1 } from "./InsertStackContractV1";

export const insertStackV2 = upgradeAggregateContractRelease(insertStackV1, {
  version: 2,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("insertStackV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
