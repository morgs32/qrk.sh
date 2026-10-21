import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { moveStack } from "./MoveStackContractV1";

export const moveStackV2 = upgradeAggregateContractVersion(moveStack, {
  version: "2.0.0",
  models: { placement },
  operations: { updatePlacement: placement.operations.update },
});
