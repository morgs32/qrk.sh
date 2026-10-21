import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { configureGithubActivity } from "./ConfigureGithubActivityV1";

export const configureGithubActivityV2 = upgradeAggregateContractVersion(
  configureGithubActivity,
  {
    version: "2.0.0",
    models: { placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
