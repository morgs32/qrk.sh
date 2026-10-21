import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureFigmaThumbnail } from "./ConfigureFigmaThumbnailV1";

export const configureFigmaThumbnailV2 = upgradeAggregateContractVersion(configureFigmaThumbnail, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
