import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { setRowMinHeightV1 } from "./SetRowMinHeightV1";

export const setRowMinHeightV2 = upgradeAggregateContractRelease(setRowMinHeightV1, {
  version: 2,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowMinHeightV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
