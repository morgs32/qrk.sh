import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureGithubProfile } from "./ConfigureGithubProfileV1";

export const configureGithubProfileV2 = upgradeAggregateContractVersion(
  configureGithubProfile,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
