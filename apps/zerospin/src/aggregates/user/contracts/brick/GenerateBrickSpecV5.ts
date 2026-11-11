import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { generateBrickSpecV4 } from "./GenerateBrickSpecV4";
import { generateBrickSpecExternalDefinitionV5 } from "./GenerateBrickSpecExternalDefinitionV5";

export const generateBrickSpecV5 = upgradeAggregateContractRelease(generateBrickSpecV4, {
  version: 5,
  payload: {},
  models: { brick },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV5.externalOperation },
  down: Effect.fn("generateBrickSpecV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
