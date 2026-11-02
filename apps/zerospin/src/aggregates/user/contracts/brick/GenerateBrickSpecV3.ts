import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { generateBrickSpecV2 } from "./GenerateBrickSpecV2";
import { generateBrickSpecExternalDefinitionV3 } from "./GenerateBrickSpecExternalDefinitionV3";

export const generateBrickSpecV3 = upgradeAggregateContractRelease(generateBrickSpecV2, {
  version: 3,
  models: { wall, placement },
  operations: {
    updatePlacement: placement.operations.update,
    generateSpec: generateBrickSpecExternalDefinitionV3.externalOperation,
  },
});
