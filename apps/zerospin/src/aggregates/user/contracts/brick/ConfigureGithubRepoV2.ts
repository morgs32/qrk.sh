import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureGithubRepo } from "./ConfigureGithubRepoV1";

export const configureGithubRepoV2 = upgradeAggregateContractVersion(
  configureGithubRepo,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
