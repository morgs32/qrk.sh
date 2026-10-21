import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureMapPlace } from "./ConfigureMapPlaceV1";

export const configureMapPlaceV2 = upgradeAggregateContractVersion(configureMapPlace, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
