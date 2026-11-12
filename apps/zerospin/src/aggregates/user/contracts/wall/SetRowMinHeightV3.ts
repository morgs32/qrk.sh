import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowMinHeightV2 } from "./SetRowMinHeightV2";

export const setRowMinHeightV3 = upgradeAggregateContractRelease(setRowMinHeightV2, {
  version: 3,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowMinHeightV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
