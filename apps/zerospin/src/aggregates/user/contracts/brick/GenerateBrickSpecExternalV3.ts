import { upgradeAggregateExternalContractRelease } from "@zerospin/sdk";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { generateBrickSpecExternalV2 } from "./GenerateBrickSpecExternalV2";
import { generateBrickSpecExternalDefinitionV3 } from "./GenerateBrickSpecExternalDefinitionV3";

export const generateBrickSpecExternalV3 = upgradeAggregateExternalContractRelease(
  generateBrickSpecExternalV2,
  {
    definition: generateBrickSpecExternalDefinitionV3,
    models: { wall, placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
