import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeInstagram } from "./CompleteInstagramV1";

export const completeInstagramV2 = upgradeAggregateContractVersion(completeInstagram, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
