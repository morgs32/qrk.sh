import { placementV2 as Placement } from "../../models/placement/PlacementV2";
import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { publishSiteV2 } from "./PublishSiteV2";

export const publishSiteV3 = upgradeAggregateContractVersion(publishSiteV2, {
  version: "3.0.0",
  models: { placement: Placement },
});
