import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { renameStackV3 } from "./RenameStackContractV3";

export const renameStackV4 = upgradeAggregateContractRelease(renameStackV3, {
  version: 4,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("renameStackV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
