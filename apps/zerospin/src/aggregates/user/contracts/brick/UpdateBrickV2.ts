import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { updateBrick as previous } from "./UpdateBrickV1";

export const updateBrickV2 = upgradeAggregateContractVersion(previous, {
  operations: { updatePlacement: placement.operations.update },
  models: { placement },
  version: "2.0.0",
});
