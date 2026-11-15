import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { brickV2 } from "../../models/brick/BrickV2";
import { generateBrickSpecV1 } from "./GenerateBrickSpecV1";
import { generateBrickSpecExternalDefinitionV2 } from "./GenerateBrickSpecExternalDefinitionV2";

export const generateBrickSpecV2 = upgradeAggregateContractRelease(generateBrickSpecV1, {
  version: 2,
  models: { brick: { model: brickV2, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV2.externalOperation },
});
