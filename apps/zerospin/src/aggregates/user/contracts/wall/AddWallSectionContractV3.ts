import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { addWallSectionV2 } from "./AddWallSectionContractV2";

export const addWallSectionV3 = upgradeAggregateContractRelease(addWallSectionV2, {
  version: 3,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("addWallSectionV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
