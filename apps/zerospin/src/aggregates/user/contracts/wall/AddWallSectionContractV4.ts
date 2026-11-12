import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { addWallSectionV3 } from "./AddWallSectionContractV3";

export const addWallSectionV4 = upgradeAggregateContractRelease(addWallSectionV3, {
  version: 4,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("addWallSectionV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
