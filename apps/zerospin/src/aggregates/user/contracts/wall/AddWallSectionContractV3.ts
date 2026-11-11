import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { addWallSectionV2 } from "./AddWallSectionContractV2";

export const addWallSectionV3 = upgradeAggregateContractRelease(addWallSectionV2, {
  version: 3,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("addWallSectionV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
