import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { addWallSectionV1 } from "./AddWallSectionContractV1";
import { wallV2 as wall } from "../../models/wall/WallV2";

export const addWallSectionV2 = upgradeAggregateContractRelease(addWallSectionV1, {
  version: 2,
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
});
