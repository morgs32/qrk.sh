import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { brickV2 } from "../../models/brick/BrickV2";
import { deleteBrickV1 } from "./DeleteBrickContractV1";

export const deleteBrickV2 = upgradeAggregateContractRelease(deleteBrickV1, {
  version: 2,
  models: { brick: brickV2 },
  operations: { deleteBrick: brickV2.operations.delete },
});
