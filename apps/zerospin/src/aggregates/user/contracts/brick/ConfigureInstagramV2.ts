import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureInstagram } from "./ConfigureInstagramV1";

export const configureInstagramV2 = upgradeAggregateContractVersion(configureInstagram, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
