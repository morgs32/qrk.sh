import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { addBrick } from "./AddBrickContractV1";

export const addBrickV2 = upgradeAggregateContractVersion(addBrick, {
  version: "2.0.0",
  models: { placement },
  operations: {
    updatePlacement: placement.operations.update,
    createPlacement: placement.operations.create,
  },
});
