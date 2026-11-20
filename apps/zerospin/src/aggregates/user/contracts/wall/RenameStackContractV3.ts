import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { renameStackV2 } from "./RenameStackContractV2";

export const renameStackV3 = upgradeAggregateContractRelease(renameStackV2, {
  version: 3,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("renameStackV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
