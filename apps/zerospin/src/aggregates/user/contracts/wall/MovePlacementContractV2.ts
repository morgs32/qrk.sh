import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { brickV2 } from "../../models/brick/BrickV2";
import { movePlacementV1 } from "./MovePlacementContractV1";

export const movePlacementV2 = upgradeAggregateContractRelease(movePlacementV1, {
  version: 2,
  models: { brick: brickV2 },
});
