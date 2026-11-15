import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { brickV2 } from "../../models/brick/BrickV2";
import { deleteBrickV1 } from "./DeleteBrickContractV1";

export const deleteBrickV2 = upgradeAggregateContractRelease(deleteBrickV1, {
  version: 2,
  models: { brick: { model: brickV2, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { deleteBrick: brickV2.operations.delete },
});
