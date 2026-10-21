import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { movePlacement } from "./MovePlacementContractV1";

export const movePlacementV2 = upgradeAggregateContractVersion(
  movePlacement,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
