import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeLink } from "./CompleteLinkV1";

export const completeLinkV2 = upgradeAggregateContractVersion(completeLink, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
