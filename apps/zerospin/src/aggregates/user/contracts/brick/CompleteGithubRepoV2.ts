import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { completeGithubRepo } from "./CompleteGithubRepoV1";

export const completeGithubRepoV2 = upgradeAggregateContractVersion(
  completeGithubRepo,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
