import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeMapPlace } from "./CompleteMapPlaceV1";

export const completeMapPlaceV2 = upgradeAggregateContractVersion(completeMapPlace, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
