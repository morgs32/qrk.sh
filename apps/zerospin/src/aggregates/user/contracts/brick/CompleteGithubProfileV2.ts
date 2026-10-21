import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeGithubProfile } from "./CompleteGithubProfileV1";

export const completeGithubProfileV2 = upgradeAggregateContractVersion(
  completeGithubProfile,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
