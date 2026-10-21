import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { deleteBrick } from "./DeleteBrickContractV1";

export const deleteBrickV2 = upgradeAggregateContractVersion(deleteBrick, {
  version: "2.0.0",
  models: { placement },
  operations: {
    deletePlacement: placement.operations.delete,
    updatePlacement: placement.operations.update,
  },
});
