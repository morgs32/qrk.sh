import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeFigmaThumbnail } from "./CompleteFigmaThumbnailV1";

export const completeFigmaThumbnailV2 = upgradeAggregateContractVersion(completeFigmaThumbnail, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
