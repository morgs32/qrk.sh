import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowMinHeightV2 } from "./SetRowMinHeightV2";

export const setRowMinHeightV3 = upgradeAggregateContractRelease(setRowMinHeightV2, {
  version: 3,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowMinHeightV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
