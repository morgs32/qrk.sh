import { placementV2 as Placement } from "../../models/placement/PlacementV2";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { publishPageV2 } from "./PublishPageV2";

export const publishPageV3 = upgradeAggregateContractVersion(publishPageV2, {
  version: "3.0.0",
  models: { placement: Placement },
});
