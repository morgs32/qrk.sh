import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { brickV2 } from "../../models/brick/BrickV2";
import { updateBrickV1 } from "./UpdateBrickV1";

export const updateBrickV2 = upgradeAggregateContractRelease(updateBrickV1, {
  version: 2,
  models: { brick: brickV2 },
  operations: { updateBrick: brickV2.operations.update },
});
