import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { brickV2 } from "../../models/brick/BrickV2";
import { generateBrickSpecV1 } from "./GenerateBrickSpecV1";
import { generateBrickSpecExternalDefinitionV2 } from "./GenerateBrickSpecExternalDefinitionV2";

export const generateBrickSpecV2 = upgradeAggregateContractRelease(generateBrickSpecV1, {
  version: 2,
  models: { brick: brickV2 },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV2.externalOperation },
});
