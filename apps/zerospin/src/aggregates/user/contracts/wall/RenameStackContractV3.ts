import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { renameStackV2 } from "./RenameStackContractV2";

export const renameStackV3 = upgradeAggregateContractRelease(renameStackV2, {
  version: 3,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("renameStackV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
