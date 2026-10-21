import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { addWallSection } from "./AddWallSectionContractV1";

export const addWallSectionV2 = upgradeAggregateContractVersion(
  addWallSection,
  {
    version: "2.0.0",
    models: { placement },
  },
);
