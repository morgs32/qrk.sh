import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { setRowMinHeightV1 } from "./SetRowMinHeightV1";

export const setRowMinHeightV2 = upgradeAggregateContractRelease(setRowMinHeightV1, {
  version: 2,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowMinHeightV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
