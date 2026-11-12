import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowAlignmentV1 } from "./SetRowAlignmentV1";

export const setRowAlignmentV2 = upgradeAggregateContractRelease(setRowAlignmentV1, {
  version: 2,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowAlignmentV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
