import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { renameStackV1 } from "./RenameStackContractV1";
import { wallV2 as wall } from "../../models/wall/WallV2";

export const renameStackV2 = upgradeAggregateContractRelease(renameStackV1, {
  version: 2,
  models: { wall },
  operations: { updateWall: wall.operations.update },
});
