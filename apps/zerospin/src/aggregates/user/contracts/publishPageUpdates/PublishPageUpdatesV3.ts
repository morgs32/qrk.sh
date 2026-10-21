import { placementV2 as Placement } from "../../models/placement/PlacementV2";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { publishPageUpdatesV2 } from "./PublishPageUpdatesV2";

export const publishPageUpdatesV3 = upgradeAggregateContractVersion(publishPageUpdatesV2, {
  version: "3.0.0",
  models: { placement: Placement },
});
