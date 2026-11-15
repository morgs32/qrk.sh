import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { renameStackV1 } from "./RenameStackContractV1";
import { wallV2 as wall } from "../../models/wall/WallV2";

export const renameStackV2 = upgradeAggregateContractRelease(renameStackV1, {
  version: 2,
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
});
