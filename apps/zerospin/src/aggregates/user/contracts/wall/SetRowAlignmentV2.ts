import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowAlignmentV1 } from "./SetRowAlignmentV1";

export const setRowAlignmentV2 = upgradeAggregateContractRelease(setRowAlignmentV1, {
  version: 2,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowAlignmentV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
