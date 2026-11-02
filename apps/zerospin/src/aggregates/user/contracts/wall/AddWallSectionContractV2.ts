import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { addWallSectionV1 } from "./AddWallSectionContractV1";
import { wallV2 as wall } from "../../models/wall/WallV2";

export const addWallSectionV2 = upgradeAggregateContractRelease(addWallSectionV1, {
  version: 2,
  models: { wall },
  operations: { updateWall: wall.operations.update },
});
